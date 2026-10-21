import type { ZxcvbnFactory } from '@zxcvbn-ts/core'

let estimator: Promise<ZxcvbnFactory> | undefined

export function passwordBytes(password: string) {
  return new TextEncoder().encode(password).length
}

export async function passwordScore(password: string): Promise<number> {
  estimator ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ])
    .then(
      ([core, common, en]) =>
        new core.ZxcvbnFactory({
          translations: en.translations,
          graphs: common.adjacencyGraphs,
          dictionary: { ...common.dictionary, ...en.dictionary },
        }),
    )
    .catch((error) => {
      estimator = undefined
      throw error
    })
  const checker = await estimator

  return checker.check(password, ['wapo']).score
}
