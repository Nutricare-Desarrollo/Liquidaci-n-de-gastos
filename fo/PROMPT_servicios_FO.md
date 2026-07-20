# Prompt reutilizable — Crear un servicio custom (contract-based) en D365 FO

> Copiá este prompt a tu asistente de código y completá lo que está entre `{{ }}`.
> Está basado en un servicio ya probado en producción/sandbox e incorpora las
> lecciones aprendidas (deserialización de listas, dimensiones, tamaños de campo, etc.).

---

## Prompt

Actuá como un desarrollador senior de **Dynamics 365 Finance & Operations (X++)**.
Necesito un **servicio personalizado basado en data contracts** que se pueda llamar por
HTTP (JSON) y también probar con una clase ejecutable dentro de FO.

### Objetivo
{{Describí qué debe hacer: p.ej. "crear registros en la tabla X con sus líneas", "leer/actualizar Y", etc.}}

### Tabla(s) y campos destino
- Tabla cabecera: `{{NombreTabla}}` — campos a setear: `{{campo1, campo2, ...}}`
- (Si aplica) Tabla de líneas: `{{NombreTablaLinea}}` — campos: `{{...}}`, enlazada a la cabecera por `{{campoRef}}`
- Número/secuencia: `{{si usa NumberSeq, indicá la referencia; si no, N/A}}`
- ¿Es por compañía (dataAreaId)? `{{sí/no}}`. Si sí, las compañías son `{{NTC, FEH, ...}}`.

### Contratos requeridos
1. Un DataContract de **entrada** (cabecera) con `[DataContractAttribute]`, un método `parm...`
   por cada campo con `[DataMemberAttribute('NombreExterno')]`.
2. Si hay líneas: un DataContract de **línea** y, en el de entrada, una colección
   `List` con `[DataCollectionAttribute(Types::Class, classStr(ContratoLinea))]`.
3. Un DataContract de **salida** con al menos: `Success` (boolean), `Message` (str),
   los ids/números creados, y flags útiles (p.ej. `AlreadyExisted`).

### Reglas OBLIGATORIAS (lecciones aprendidas — respetalas)
1. **Deserialización de listas (CRÍTICO):** el endpoint JSON de FO NO instancia bien un
   `List` de clases (deja `JObject` y lanza `InvalidCastException`). Por eso el método del
   servicio debe recibir el request como **un solo `str` JSON** y deserializarlo con
   `FormJsonSerializer::deserializeObject(classNum(ContratoEntrada), _json)`. Así la lista
   de líneas queda tipada correctamente.
2. **Compañía:** si la tabla es por compañía, usar `changecompany(strUpr(company)) { ... }`.
   En tablas de gastos/transacciones, setear también los campos de entidad legal que la
   tabla exija (p.ej. `LegalEntity = CompanyInfo::findDataArea(company).RecId`,
   `InterCompanyLE = company`) — si falta, el insert puede fallar con "RecId 0".
3. **Transacción:** envolver los inserts en `ttsbegin; ... ttscommit;`.
4. **Idempotencia / anti-duplicado (recomendado):** agregar un campo de extensión
   `{{Prefijo}}ExternalId` a la tabla cabecera (vía EDT + table extension) y, antes de
   insertar, hacer `select firstonly ... where ...ExternalId == _request.parmExternalId()`;
   si existe, devolver el registro existente (no duplicar).
   - **OJO con el tamaño del EDT:** poné `String Size = 100` **y** `Database String Size = 100`
     (no `Auto`), y hacé **Synchronize database (full)**. Si queda corto, el valor se
     trunca en SQL y el anti-duplicado falla silenciosamente.
5. **Palabras reservadas:** no uses nombres de variable reservados de X++ (`count`, `sum`,
   `next`, etc.). Usá nombres alternativos (`numLineas`, etc.).
6. **Campos por método vs propiedad:** recordá que muchos valores son **campos** de tabla
   (ej. `HcmWorker.PersonnelNumber`), no métodos.
7. **Manejo de error:** `try/catch (Exception::Error)` y devolver en `Message` el
   `infolog.text()` (trae el detalle real del error de FO).
8. **Valores válidos:** los códigos que se envían (categorías, métodos de pago, grupos de
   impuestos, etc.) deben existir con el mismo código en FO; si no, FO da warning o error.

### Entregables que espero de vos
1. El/los archivos X++ con **todas las clases** (contratos de entrada, línea, salida y el
   servicio) listas para pegar en un modelo.
2. Instrucciones para el **EDT** y la **table extension** del `ExternalId` (si aplica).
3. Cómo **exponer** el servicio: crear un **Service** (clase + operación) y un
   **Service Group** con `AutoDeploy = Yes`; indicá la URL final
   `/api/services/{{ServiceGroup}}/{{Service}}/{{Operacion}}`.
4. Una **clase Job de prueba** que arme el request, lo serialice con
   `FormJsonSerializer::serializeClass(request)` y llame al servicio (para probar sin HTTP).
5. (Opcional) Una **clase Job de lectura** que consulte los registros creados e imprima
   los campos clave al Infolog (para verificar sin acceso a la UI).
6. Un **ejemplo de body JSON** para llamar el servicio por HTTP (Postman), con la forma
   `{ "_requestJson": "{...request serializado...}" }`.

### Autenticación (contexto, no código)
El backend llama con OAuth2 client_credentials; en FO hay que registrar el **Client ID**
en *System administration → Setup → Microsoft Entra ID applications* con un **usuario de
servicio** que tenga roles + acceso a las compañías. El scope es `{{URL_ambiente}}/.default`.

---

## Notas de uso
- Cambiá `{{ }}` por los valores de tu caso.
- Si tu servicio NO tiene líneas (solo cabecera simple), podés omitir la regla 1 y recibir
  el contrato directo; pero si algún día agregás una colección, volvé al patrón de string JSON.
- Pedile al asistente que te devuelva primero el X++ y el checklist de despliegue, y luego
  el Job de prueba, para ir validando por partes.
