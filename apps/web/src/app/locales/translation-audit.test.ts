import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const spanishCopy =
  /[áéíóúÁÉÍÓÚñÑ¿¡]|\b(?:Sin|Guardar|Cancelar|Crear|Editar|Eliminar|Buscar|Conectar|Seleccion|Configur|Proyecto|Usuario|Mensaje|Conexi|Estado|Nombre|Idioma|Categoría|Últim|Todavía|Elegí|Probá|Revisá|Volvé|Administrá|Cargando|Enviando|Pendiente|Aprobado|Rechazado|Pausado|Deshabilitado)\b/

describe('translation coverage', () => {
  it('keeps page-level product copy out of JSX literals', () => {
    const pages = join(process.cwd(), 'src/pages')
    const offenders = readdirSync(pages)
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) =>
        spanishCopy.test(readFileSync(join(pages, name), 'utf8')),
      )

    expect(offenders).toEqual([])
  })
})
