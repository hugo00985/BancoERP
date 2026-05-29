# Formato interbancario estandar

El flujo interbancario vigente usa un unico formato JSON acordado por los bancos. Los adaptadores antiguos quedan solo como soporte de parseo de respuestas, pero las transferencias salientes y entrantes trabajan con este contrato.

## Contrato obligatorio

```json
{
  "TransactionID": "BIGT2026-20260528-143005-A1B2",
  "cuentaOrigen": "GT17798309563044741",
  "swiftOrigen": "BIGT2026",
  "cuentaDestino": "EXT123",
  "swiftDestino": "GTB666",
  "NombreOrigen": "Maria Lopez",
  "monto": 100.5,
  "descripcion": "Transferencia interbancaria"
}
```

Campos requeridos:

- `TransactionID`
- `cuentaOrigen`
- `swiftOrigen`
- `cuentaDestino`
- `swiftDestino`
- `NombreOrigen`
- `monto`

`monto` debe ser mayor a `0`. La moneda se asume siempre como `GTQ`.

## Transferencias salientes

Endpoint interno para clientes autenticados:

```http
POST /api/interbancaria/transferir
Authorization: Bearer JWT
Content-Type: application/json
```

Request desde el dashboard:

```json
{
  "cuentaOrigen": "GT17798309563044741",
  "swiftDestino": "GTB666",
  "cuentaDestino": "EXT123",
  "monto": 100.5,
  "descripcion": "Transferencia interbancaria"
}
```

El backend valida cuenta origen, saldo y banco destino. Luego genera `TransactionID` con formato:

```text
BIGT2026-YYYYMMDD-HHMMSS-XXXX
```

Ese mismo valor se guarda como `referenciaInterna` e `idempotencyKey` y se envia al banco externo en el formato estandar.

## Transferencias entrantes

Endpoint publico para otros bancos:

```http
POST /api/interbancaria/entrante
Content-Type: application/json
```

Request esperado:

```json
{
  "TransactionID": "GTTBXXXX-20260528-143005-B7C9",
  "cuentaOrigen": "TB-10001",
  "swiftOrigen": "GTTBXXXX",
  "cuentaDestino": "GT17798309563044741",
  "swiftDestino": "BIGT2026",
  "NombreOrigen": "Cliente externo",
  "monto": 125.5,
  "descripcion": "Transferencia recibida"
}
```

Reglas de entrada:

- `swiftDestino` debe coincidir con `LOCAL_BANK_SWIFT`.
- `TransactionID` se usa como referencia interna e idempotencyKey.
- Si la cuenta destino local existe, se acredita el saldo y se registra movimiento.
- Si Telegram esta vinculado, se notifica sin interrumpir la transferencia si falla.

Respuesta confirmada:

```json
{
  "success": true,
  "estado": "CONFIRMADA",
  "referenciaInterna": "GTTBXXXX-20260528-143005-B7C9",
  "mensaje": "Transferencia recibida correctamente"
}
```

## Bancos configurados

Todos los bancos se consumen con el mismo payload estandar:

- Turbio Bank: `GTTBXXXX`
- NovaBank: `GTB666`
- Banco Los Canchitos: `GTBC6968`
- DEFAULT: cualquier otro banco activo

Las respuestas externas se interpretan como exito si devuelven:

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

Se interpretan como rechazo si devuelven `RECHAZADO`, `success: false`, `valida: false` o un estado de error.

## Errores posibles

```json
{
  "success": false,
  "error": "Campos requeridos faltantes: TransactionID, NombreOrigen"
}
```

```json
{
  "success": false,
  "error": "El monto debe ser mayor a cero"
}
```

```json
{
  "success": false,
  "error": "swiftDestino debe ser BIGT2026"
}
```

```json
{
  "success": false,
  "error": "Cuenta destino local no encontrada"
}
```

## Logs

Logs principales:

```text
[Interbank][SWIFT][REQUEST]
[Interbank][SWIFT][RESPONSE]
[Interbank][INCOMING] payload normalizado
[Interbank][INCOMING] cuentaDestino normalizada: ...
```

El servicio conserva `request_payload` y `response_payload` en `transferencias_interbancarias` cuando las columnas existen.
