import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const spanishCopy =
  /[áéíóúÁÉÍÓÚñÑ¿¡]|\b(?:Sin|Guardar|Cancelar|Crear|Editar|Eliminar|Buscar|Conectar|Seleccion|Configur|Proyecto|Usuario|Mensaje|Conexi|Estado|Nombre|Idioma|Categoría|Últim|Todavía|Elegí|Probá|Revisá|Volvé|Administrá|Cargando|Enviando|Pendiente|Aprobado|Rechazado|Pausado|Deshabilitado)\b/

describe('translation coverage', () => {
  it('keeps page-level and shared resource copy out of JSX literals', () => {
    const pages = join(process.cwd(), 'src/pages')
    const shared = [
      'ui.tsx',
      'status.tsx',
      'connection-cards.tsx',
      'connections-table.tsx',
    ].map((name) => join(process.cwd(), 'src/components', name))
    const files = readdirSync(pages)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => join(pages, name))
      .concat(shared)
    const offenders = files
      .filter((file) => spanishCopy.test(readFileSync(file, 'utf8')))
      .map((file) => file.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })
})
