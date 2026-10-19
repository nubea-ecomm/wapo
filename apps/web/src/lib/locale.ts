export function currentLocale() {
  const language =
    typeof document === 'undefined' ? 'es' : document.documentElement.lang

  return language === 'en' ? 'en-US' : language === 'pt' ? 'pt-BR' : 'es-AR'
}
