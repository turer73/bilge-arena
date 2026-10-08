// Test-only native runtime. No connection URL or existing data directory accepted.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import pg from 'pg'

export async function startSourceReviewPostgres(bin) {
  assert(isAbsolute(bin),'PostgreSQL bin directory must be absolute')
  const executable=name=>join(bin,name+(process.platform==='win32'?'.exe':''))
  for(const name of ['initdb','pg_ctl']) assert(existsSync(executable(name)),`Missing ${name}`)
  const cluster=mkdtempSync(join(tmpdir(),'bilge-source-review-pg-'))
  const data=join(cluster,'data')
  const run=(name,args)=>execFileSync(executable(name),args,{windowsHide:true,encoding:'utf8',timeout:45000,stdio:name==='pg_ctl'?'ignore':'pipe'})
  let client,started=false,closed=false
  async function close() {
    if(closed) return
    closed=true
    try { await client?.end() }
    finally { if(started && existsSync(join(data,'postmaster.pid'))) run('pg_ctl',['-D',data,'-m','fast','-w','-t','30','stop']) }
    // Retain the fresh directory/log for diagnosis; never delete an existing cluster.
  }
  try {
    run('initdb',['-D',data,'-U','postgres','--auth-local=trust','--auth-host=trust','--no-locale','-E','UTF8'])
    const port=await new Promise((resolve,reject)=>{
      const server=createServer();server.once('error',reject)
      server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port))})
    })
    started=true
    run('pg_ctl',['-D',data,'-l',join(cluster,'postgres.log'),'-w','-t','30','-o',`-F -h 127.0.0.1 -p ${port} -c unix_socket_directories=`,'start'])
    const options={host:'127.0.0.1',port,database:'postgres',user:'postgres',connectionTimeoutMillis:5000,query_timeout:15000}
    client=new pg.Client(options);await client.connect()
    const serverData=(await client.query('SHOW data_directory')).rows[0].data_directory
    assert.equal(realpathSync(serverData).toLowerCase(),realpathSync(data).toLowerCase(),'Refuse an existing cluster')
    assert.equal((await client.query('SHOW unix_socket_directories')).rows[0].unix_socket_directories,'')
    const serverVersion=(await client.query('SHOW server_version')).rows[0].server_version
    await client.query("SET TIME ZONE 'UTC'")
    return {query:(sql,values)=>client.query(sql,values),exec:sql=>client.query(sql),close,cluster,serverVersion,
      // Fixed disposable DB name is created here; callers cannot select a remote DB.
      async createGovernanceDatabase() {
        await client.query('CREATE DATABASE bilge_r43_test_source_v2')
        return `postgresql://postgres@127.0.0.1:${port}/bilge_r43_test_source_v2`
      },
    }
  } catch(error) {
    try { await close() } catch(cleanupError) { throw new AggregateError([error,cleanupError],'Native PostgreSQL setup/cleanup failed') }
    throw error
  }
}
