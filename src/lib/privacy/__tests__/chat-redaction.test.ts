import { describe, expect, it } from 'vitest'
import { redactChatPersonalData } from '../chat-redaction'

// Her satır: [girdi, beklenen çıktı]. Pozitif tablolar maskelenmesi gereken
// yazımları, negatif tablolar dokunulmaması gereken ders metinlerini sabitler.

describe('redactChatPersonalData — pozitif örnekler', () => {
  it.each([
    ['Bana Ada.Test+okul@ornek.com yaz.', 'Bana [E-POSTA] yaz.'],
    ['Veli: veli@örnek.com', 'Veli: [E-POSTA]'],
    ['Veli: veli@o\u0308rnek.com', 'Veli: [E-POSTA]'],
    ['Veli: veli@i\u0307stanbul.com', 'Veli: [E-POSTA]'],
    ['ayse(at)gmail.com', '[E-POSTA]'],
    ['AYSE(AT)GMAIL.COM', '[E-POSTA]'],
    ['ayse [at] gmail [dot] com adresime', '[E-POSTA] adresime'],
    ['ayse{et}okul(nokta)k12(nokta)tr', '[E-POSTA]'],
    ['ayse @ gmail.com', '[E-POSTA]'],
    ['ayse＠gmail.com', '[E-POSTA]'],
    ['yaz: ayse at gmail dot com', 'yaz: [E-POSTA]'],
    ['yaz: ayse et hotmail nokta com', 'yaz: [E-POSTA]'],
    ['yaz: ayse at gmail.com', 'yaz: [E-POSTA]'],
  ])('e-posta: %j', (input, expected) => {
    expect(redactChatPersonalData(input)).toBe(expected)
  })

  it.each([
    ['IBAN: TR33 0006 1005 1978 6457 8413 26', 'IBAN: [IBAN]'],
    ['IBAN: TR330006100519786457841326', 'IBAN: [IBAN]'],
    ['iban tr33 0006 1005 1978 6457 8413 26', 'iban [IBAN]'],
    ['TR33-0006-1005-1978-6457-8413-26', '[IBAN]'],
    ['TR33 0006 1005 1978 6457 8413 26 nolu hesaba', '[IBAN] nolu hesaba'],
    ['DE89 3704 0044 0532 0130 00 ve GB82 WEST 1234 5698 7654 32', '[IBAN] ve [IBAN]'],
    ['BE68 5390 0754 7034 olan hesap', '[IBAN] olan hesap'],
    ['NO93 8601 1117 947.', '[IBAN].'],
  ])('IBAN (ülke uzunluğu + mod-97): %j', (input, expected) => {
    expect(redactChatPersonalData(input)).toBe(expected)
  })

  it.each([
    ['Kart: 4111 1111 1111 1111', 'Kart: [KART]'],
    ['Kart: 4111111111111111', 'Kart: [KART]'],
    ['Kart: 5555-5555-5555-4444', 'Kart: [KART]'],
    ['Kart: 2223 0000 4841 0010', 'Kart: [KART]'],
    ['Kart: 3782 822463 10005', 'Kart: [KART]'],
    ['Kart: 6011 1111 1111 1117.', 'Kart: [KART].'],
  ])('kart (IIN + Luhn): %j', (input, expected) => {
    expect(redactChatPersonalData(input)).toBe(expected)
  })

  it.each([
    ['+90 (532) 123 45 67 ile ulaş.', '[TELEFON] ile ulaş.'],
    ['Sabit hat: 0212 555 44 33.', 'Sabit hat: [TELEFON].'],
    ['Telefonlar 5321234567 ve 0090 532 123 45 67.', 'Telefonlar [TELEFON] ve [TELEFON].'],
    ['Telefon: 905321234567 veya 90 212 555 44 33.', 'Telefon: [TELEFON] veya [TELEFON].'],
    ['Alan kodu 212 555 44 33.', 'Alan kodu [TELEFON].'],
    ['tel05321234567 veya numaram05321234567', 'tel[TELEFON] veya numaram[TELEFON]'],
    ['tel5321234567 veya numaram532 123 45 67', 'tel[TELEFON] veya numaram[TELEFON]'],
    ['0532 - 123 - 45 - 67', '[TELEFON]'],
    ['(0532) 123 45 67', '[TELEFON]'],
    ['0 (532) 123 45 67', '[TELEFON]'],
    ['532.123.45.67', '[TELEFON]'],
    ['0532 123 4567', '[TELEFON]'],
    ['(312) 444-55-66', '[TELEFON]'],
    ['0850 222 33 44', '[TELEFON]'],
  ])('Türkiye telefonu: %j', (input, expected) => {
    expect(redactChatPersonalData(input)).toBe(expected)
  })

  it.each([
    ['Numaram +49 151 23456789', 'Numaram [TELEFON]'],
    ['+1 (415) 555-2671', '[TELEFON]'],
    ['+44 20 7946 0958 arayın', '[TELEFON] arayın'],
    ['+33 1 23 45 67 89', '[TELEFON]'],
    ['0049 30 1234567', '[TELEFON]'],
    ['+4915123456789', '[TELEFON]'],
  ])('yabancı numara: %j', (input, expected) => {
    expect(redactChatPersonalData(input)).toBe(expected)
  })

  it.each([
    ['T.C. numaram 10000000146.', 'T.C. numaram [TC-KIMLIK].'],
    ['Kimlik: 100 000 001 46', 'Kimlik: [TC-KIMLIK]'],
    ['T.C.10000000146', 'T.C.[TC-KIMLIK]'],
    ['100-000-001-46', '[TC-KIMLIK]'],
  ])('T.C. kimlik (sağlama toplamı): %j', (input, expected) => {
    expect(redactChatPersonalData(input)).toBe(expected)
  })
})

describe('redactChatPersonalData — negatif örnekler (ders metni bozulmaz)', () => {
  it.each([
    // İnceleme raporunun (15 Ekim, §5) örnekleri: eski sürüm bunları [TELEFON] yapıyordu.
    '425 - 3 - 2 - 1 - 7 - 6 - 5 - 4',
    '512 3 4 5 6 7 8 9',
    '(532) 1 2 3 4 5 6 7 dizisi',
    // Eski sürüm bunu [TC-KIMLIK] yapıyordu (sağlama toplamı tutan aralıklı rakamlar).
    '1 0 0 0 0 0 0 0 1 4 6',
    // Gerçek bir alan kodu olmayan 3-3-2-2 işlem.
    '425 312 45 67 işleminin sonucu',
    '425-312-45-67 = 1',
    'Birinci dereceden denklemleri anlat.',
    '3141592653 sayısının rakamları toplamı nedir?',
    '10000000147 sayısının basamakları toplamı nedir?',
    'π ≈ 3,14159265358979',
    'Nüfus 12.345.678.901 kişidir.',
    'Sonuç +12 345 678 bulunur.',
    'x = 2+33 1 23 45 67',
    '+3 4 5 6 7 8 9 1 dizisi',
    'Yıllar: 2020 2021 2022 2023',
    'Dizi: 4125 4250 4375 4500 4625',
    '1234 5678 9012 3456 sayısını 4 ile böl.',
    'Kart değil: 4111 1111 1111 1112',
    'IBAN değil: TR33 0006 1005 1978 6457 8413 27',
    'AB12 3456 7890 1234 5678',
    'Look at example.com for details.',
    'Ali (at) yarışını kazandı.',
    'Ali et yedi, Ayşe nokta koydu.',
    '0,5321234567 olasılığı',
    'a@b',
  ])('%j aynen kalır', (input) => {
    expect(redactChatPersonalData(input)).toBe(input)
  })
})

describe('redactChatPersonalData — performans', () => {
  it.each([
    ['rakam-ayırıcı', '5 1 - 2 . 3 '.repeat(4_000)],
    ['uzun rakam koşusu', '9'.repeat(40_000)],
    ['@ ve parantez', 'a(at)b(dot)'.repeat(4_000)],
    ['IBAN başı', 'TR33 0006 '.repeat(4_000)],
    ['+ önekleri', '+1 22 333 '.repeat(4_000)],
    ['kelime + boşluk', `${'a'.repeat(2_000)}${' '.repeat(2_000)}at `.repeat(10)],
  ])('%s girdisinde doğrusal kalır', (_name, input) => {
    const started = performance.now()
    redactChatPersonalData(input)
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
