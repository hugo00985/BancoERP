# Formatos de integracion interbancaria

El backend usa un formato interno comun y adaptadores por SWIFT para hablar con bancos externos sin cambiar la logica bancaria local.

## Formato interno

```json
{
  "swiftOrigen": "INDLGTGC",
  "swiftDestino": "GTB666",
  "cuentaOrigen": "GT100000001",
  "cuentaDestino": "EXT123",
  "nombreOrigen": "Administrador Sistema",
  "nombreDestino": "Cliente externo",
  "monto": 100.5,
  "moneda": "GTQ",
  "referencia": "SWIFT-OUT-...",
  "idempotencyKey": "clave-unica"
}
```

## Como nos consumen otros bancos

Endpoint:

```http
POST /api/interbancaria/entrante
```

Formato nuestro:

```json
{
  "swiftOrigen": "BANCOEXT",
  "swiftDestino": "INDLGTGC",
  "cuentaOrigen": "EXT-001",
  "cuentaDestino": "GT100000001",
  "nombreOrigen": "Cliente externo",
  "monto": 50,
  "moneda": "GTQ",
  "referencia": "EXT-REF-001",
  "idempotencyKey": "EXT-REF-001"
}
```

Formato GTB666 aceptado:

```json
{
  "transactionId": "GTB-TX-001",
  "swiftDestino": "INDLGTGC",
  "cuentaOrigenExterna": "EXT-001",
  "cuentaDestinoExterna": "GT100000001",
  "bancoOrigen": "GTB666",
  "monto": 50,
  "direccion": "ENTRANTE"
}
```

Formato PascalCase aceptado:

```json
{
  "TransactionId": "TX-001",
  "SwiftDestino": "INDLGTGC",
  "CuentaOrigen": "EXT-001",
  "CuentaDestino": "GT100000001",
  "Monto": 50
}
```

Si el formato PascalCase no envia banco de origen, el backend usa el header `X-Bank-Swift` cuando existe. Si tampoco viene ese header, registra el origen como `EXTERNO`.

Respuesta exitosa:

```json
{
  "success": true,
  "estado": "CONFIRMADA",
  "referenciaInterna": "SWIFT-IN-...",
  "mensaje": "Transferencia recibida correctamente"
}
```

## Como consumimos Turbio Bank

SWIFT: `GTTBXXXX`

Base URL:

```text
https://repo-banco-api-desarrollo.up.railway.app
```

Endpoint de validacion/transferencia:

```text
/api/transferencia/validar
```

Payload enviado:

```json
{
  "TransactionID": "SWIFT-OUT-...",
  "cuentaOrigen": "GT100000001",
  "swiftOrigen": "INDLGTGC",
  "cuentaDestino": "EXT123",
  "swiftDestino": "GTTBXXXX",
  "NombreOrigen": "Administrador Sistema",
  "monto": 100.5,
  "descripcion": "Transferencia interbancaria"
}
```

Respuesta de exito aceptada:

```json
"APROBADO"
```

## Como consumimos NovaBank

SWIFT: `GTB666`

Base URL:

```text
https://apibanca.onrender.com
```

Endpoint de transferencia entrante:

```text
/api/transferencias/interbancaria/entrante
```

Payload de transferencia:

```json
{
  "TransactionID": "SWIFT-OUT-...",
  "CuentaOrigen": "GT100000001",
  "CuentaDestino": "EXT123",
  "SwiftOrigen": "INDLGTGC",
  "SwiftDestino": "GTB666",
  "Monto": "100.5",
  "Tipo": "ACH",
  "Estado": "APROBADO",
  "Descripcion": "Transferencia interbancaria",
  "NombreOrigen": "Administrador Sistema"
}
```

Validacion de cuenta:

```json
{
  "CuentaDestino": "EXT123",
  "TransactionID": "SWIFT-VAL-..."
}
```

Si NovaBank responde que faltan campos requeridos, el adaptador intenta fallback con `TransactionId`:

```json
{
  "CuentaDestino": "EXT123",
  "TransactionId": "SWIFT-VAL-..."
}
```

## Como consumimos Banco Los Canchitos

SWIFT: `GTBC6968`

Base URL:

```text
https://api-proyecto-production-c611.up.railway.app
```

Endpoint principal:

```text
/api/transferencias
```

Endpoint alterno:

```text
/api/transferencias/interbancaria/entrante
```

Validacion de cuenta:

```json
{
  "cuentaDestino": "EXT123",
  "swiftDestino": "GTBC6968"
}
```

Transferencia saliente:

```json
{
  "cuenta_origen": "GT100000001",
  "cuenta_destino": "EXT123",
  "swift_destino": "GTBC6968",
  "monto": 100.5,
  "descripcion": "Transferencia interbancaria"
}
```

## Como consumir DEFAULT

Validacion de cuenta:

```json
{
  "swiftDestino": "RWL001",
  "cuentaDestino": "EXT123",
  "numeroCuenta": "EXT123",
  "referencia": "SWIFT-VAL-..."
}
```

Transferencia saliente:

```json
{
  "swiftOrigen": "INDLGTGC",
  "swiftDestino": "RWL001",
  "cuentaOrigen": "GT100000001",
  "cuentaDestino": "EXT123",
  "nombreOrigen": "Administrador Sistema",
  "monto": 100.5,
  "moneda": "GTQ",
  "referencia": "SWIFT-OUT-...",
  "idempotencyKey": "clave-unica"
}
```

## Errores posibles

```json
{
  "success": false,
  "error": "swiftDestino debe ser INDLGTGC"
}
```

```json
{
  "success": false,
  "error": "Cuenta destino local no encontrada"
}
```

```json
{
  "success": false,
  "error": "Banco destino no encontrado o inactivo"
}
```

```json
{
  "success": false,
  "error": "Cuenta destino rechazada por banco externo"
}
```

## Respuestas externas aceptadas

El parser interbancario trata como exito:

```json
"APROBADO"
```

```json
{
  "estado": "APROBADO"
}
```

```json
{
  "success": true
}
```

```json
{
  "numeroComprobante": "CMP-001",
  "transactionId": "TX-001",
  "estado": "APROBADO"
}
```

Y trata como fallo:

```json
{
  "estado": "RECHAZADO"
}
```

## Logs

El backend imprime logs temporales para auditoria tecnica:

```text
[Interbank][GTTBXXXX][VALIDATE] payload enviado
[Interbank][GTTBXXXX][VALIDATE] respuesta recibida
[Interbank][GTB666][TRANSFER] payload enviado
[Interbank][GTB666][TRANSFER] respuesta recibida
[Interbank][GTBC6968][TRANSFER] payload enviado
[Interbank][GTBC6968][TRANSFER] respuesta recibida
[Interbank][INCOMING] payload normalizado
```

Ademas, cuando la tabla `transferencias_interbancarias` tiene las columnas `request_payload` y `response_payload`, el servicio guarda el JSON enviado y recibido en esas columnas.
