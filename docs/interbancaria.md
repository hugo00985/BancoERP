# Modulo Interbancario SWIFT

Este modulo agrega interoperabilidad bancaria sin cambiar la transferencia local existente.
La API nueva vive bajo `/api/interbancaria`.

## Configuracion requerida

Para una base nueva en PostgreSQL/Railway, ejecutar desde el backend:

```powershell
npm run db:init
```

Si la base principal ya existe y solo quiere agregar las tablas SWIFT,
ejecutar el SQL incremental con `psql`:

```powershell
psql "%DATABASE_URL%" -f C:/BancoGT/BancoGT/database/schema_interbancario.sql
```

Variables recomendadas:

```env
LOCAL_BANK_NAME=Banco Industrial
LOCAL_BANK_SWIFT=BIGT2026
INTERBANK_REQUEST_TIMEOUT_MS=10000
INTERBANK_API_KEY=clave-compartida-para-salidas
INTERBANK_REQUIRE_API_KEY=false
```

`INTERBANK_API_KEY` se envia a otros bancos como `X-API-Key`.
`INTERBANK_REQUIRE_API_KEY=true` obliga a que `/api/interbancaria/entrante`
reciba una API key valida registrada en `api_keys_bancos`.

## Bancos externos

Tabla: `bancos_externos`.

Campos principales:

- `nombre`
- `swift`
- `base_url`
- `endpoint_validacion`
- `endpoint_transferencia`
- `activo`

Ejemplo:

```sql
INSERT INTO bancos_externos
(nombre, swift, base_url, endpoint_validacion, endpoint_transferencia, activo)
VALUES
('Banco Demo', 'DEMOGTGC', 'https://banco-demo.up.railway.app',
 '/api/transferencia/validar',
 '/api/transferencias/interbancaria/entrante',
 TRUE);
```

## Endpoints propios

### GET /api/interbancaria/bancos

Requiere JWT.

Respuesta:

```json
{
  "success": true,
  "bancos": [
    {
      "id": 1,
      "nombre": "Banco Demo",
      "swift": "DEMOGTGC",
      "baseUrl": "https://banco-demo.up.railway.app",
      "endpointValidacion": "/api/transferencia/validar",
      "endpointTransferencia": "/api/transferencias/interbancaria/entrante",
      "activo": true
    }
  ]
}
```

### POST /api/interbancaria/validar-cuenta

Requiere JWT. Valida una cuenta local si el SWIFT es el del banco local,
o consulta el endpoint de validacion del banco externo.

Request:

```json
{
  "swift": "DEMOGTGC",
  "numeroCuenta": "GT200000001"
}
```

Respuesta esperada:

```json
{
  "success": true,
  "valida": true,
  "banco": {
    "nombre": "Banco Demo",
    "swift": "DEMOGTGC"
  },
  "respuestaBanco": {
    "success": true,
    "valida": true
  }
}
```

### POST /api/interbancaria/transferir

Requiere JWT. Realiza una transferencia saliente por SWIFT.

Headers:

```http
Authorization: Bearer JWT
Content-Type: application/json
```

Request:

```json
{
  "cuentaOrigen": "GT100000001",
  "cuentaDestino": "GT200000001",
  "swiftDestino": "DEMOGTGC",
  "monto": 125.50,
  "descripcion": "Pago interbancario"
}
```

El backend genera `TransactionID` con formato `BIGT2026-YYYYMMDD-HHMMSS-XXXX`.
Ese valor se usa como referencia interna e idempotencyKey, y se envia al banco externo en el formato estandar.

Respuesta confirmada:

```json
{
  "success": true,
  "message": "Transferencia interbancaria enviada",
  "transferencia": {
    "duplicate": false,
    "id": 1,
    "estado": "CONFIRMADA",
    "referenciaInterna": "BIGT2026-20260528-143005-A1B2",
    "transactionId": "BIGT2026-20260528-143005-A1B2",
    "referenciaExterna": "EXT-123",
    "saldoNuevo": 9874.5
  }
}
```

### POST /api/interbancaria/entrante

Endpoint para otros bancos. No usa JWT porque lo consumen sistemas externos.
Puede protegerse con `X-API-Key` si `INTERBANK_REQUIRE_API_KEY=true`.

El request debe usar el formato estandar obligatorio. La moneda se asume `GTQ`.
`TransactionID` se usa como referencia interna e idempotencyKey.

Request:

```json
{
  "TransactionID": "DEMOGTGC-20260528-143005-B7C9",
  "cuentaOrigen": "GT200000001",
  "swiftOrigen": "DEMOGTGC",
  "cuentaDestino": "GT100000001",
  "swiftDestino": "BIGT2026",
  "NombreOrigen": "Cliente externo",
  "monto": 125.50,
  "descripcion": "Transferencia recibida"
}
```

Respuesta publica:

```text
APROBADO
```

Si la cuenta destino no existe:

```text
RECHAZADO
```

Internamente se sigue guardando el resultado completo en PostgreSQL, auditoria y logs.

## Formato enviado a otros bancos

Para validacion y transferencia se usa el formato estandar acordado:

```json
{
  "TransactionID": "BIGT2026-20260528-143005-A1B2",
  "cuentaOrigen": "GT100000001",
  "swiftOrigen": "BIGT2026",
  "cuentaDestino": "GT200000001",
  "swiftDestino": "DEMOGTGC",
  "NombreOrigen": "Cliente Banco Industrial",
  "monto": 125.5,
  "descripcion": "Pago interbancario"
}
```

## Estados

- `PENDIENTE`: transferencia creada o aceptada por banco externo como pendiente.
- `CONFIRMADA`: transferencia enviada/acreditada correctamente.
- `RECHAZADA`: cuenta externa/local invalida o banco externo rechazo.
- `ERROR`: fallo local despues de iniciar el flujo.

## Compatibilidad Railway

El modulo no depende de rutas absolutas ni de XAMPP. Para Railway se deben
configurar variables de entorno, base PostgreSQL accesible, MongoDB si se usa
Telegram, y URLs publicas en `bancos_externos.base_url`.
