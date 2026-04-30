import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NumField } from '../NumField'

describe('NumField', () => {
  test('1) min/max/step attributes input HTML elementinde', () => {
    render(
      <NumField label="N" name="n" min={1} max={5} defaultValue={2} step={1} />,
    )
    const input = screen.getByLabelText('N') as HTMLInputElement
    expect(input.min).toBe('1')
    expect(input.max).toBe('5')
    expect(input.step).toBe('1')
  })

  test('2) default value attribute set', () => {
    render(<NumField label="N" name="n" min={1} max={10} defaultValue={5} />)
    const input = screen.getByLabelText('N') as HTMLInputElement
    expect(input.defaultValue).toBe('5')
  })
})
