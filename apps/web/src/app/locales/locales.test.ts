import { describe, expect, it } from 'vitest'
import { productEn } from './en'
import { productEs } from './es'
import { productPt } from './pt'

describe('product translation catalogs', () => {
  it('keeps exact key parity across every supported language', () => {
    const keys = Object.keys(productEs).sort()

    expect(Object.keys(productEn).sort()).toEqual(keys)
    expect(Object.keys(productPt).sort()).toEqual(keys)
  })

  it('does not ship empty translations', () => {
    for (const catalog of [productEs, productEn, productPt]) {
      expect(
        Object.values(catalog).every((value) => value.trim().length > 0),
      ).toBe(true)
    }
  })
})
