import SwaggerParser from '@apidevtools/swagger-parser'
const spec = await SwaggerParser.validate('packages/openapi/openapi.json')
console.log(
  `Validated ${Object.keys(spec.paths).length} API paths (${spec.info.version})`,
)
