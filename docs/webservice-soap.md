# Web Service SOAP BancoGT ERP

Este documento describe el Web Service SOAP academico agregado al backend de BancoGT.
No reemplaza las rutas REST existentes; convive con ellas y reutiliza la logica bancaria actual.

## URL del servicio

Servicio SOAP:

```text
https://bancoerp-production.up.railway.app/api/ws/banco
```

WSDL:

```text
https://bancoerp-production.up.railway.app/api/ws/banco?wsdl
```

En local:

```text
http://localhost:3000/api/ws/banco?wsdl
```

## Operaciones disponibles

### consultarBanco()

Retorna informacion publica del banco local.

Respuesta:

```xml
<consultarBancoResponse>
  <nombreBanco>Banco Industrial</nombreBanco>
  <swift>BIGT2026</swift>
  <endpointInterbancario>https://bancoerp-production.up.railway.app/api/interbancaria/entrante</endpointInterbancario>
</consultarBancoResponse>
```

### validarCuenta(numeroCuenta)

Consulta si existe una cuenta local en PostgreSQL.

Request:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ban="http://bancogt.com/ws/banco">
  <soapenv:Header/>
  <soapenv:Body>
    <ban:validarCuentaRequest>
      <ban:numeroCuenta>GT17798309563044741</ban:numeroCuenta>
    </ban:validarCuentaRequest>
  </soapenv:Body>
</soapenv:Envelope>
```

Respuesta:

```xml
<validarCuentaResponse>
  <existe>true</existe>
  <numeroCuenta>GT17798309563044741</numeroCuenta>
  <estado>ACTIVA</estado>
</validarCuentaResponse>
```

### consultarSaldo(numeroCuenta)

Servicio de consulta academico/demo. Devuelve saldo solo si la cuenta existe y esta activa.

Request:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ban="http://bancogt.com/ws/banco">
  <soapenv:Header/>
  <soapenv:Body>
    <ban:consultarSaldoRequest>
      <ban:numeroCuenta>GT17798309563044741</ban:numeroCuenta>
    </ban:consultarSaldoRequest>
  </soapenv:Body>
</soapenv:Envelope>
```

Respuesta:

```xml
<consultarSaldoResponse>
  <numeroCuenta>GT17798309563044741</numeroCuenta>
  <saldo>1500.00</saldo>
  <moneda>GTQ</moneda>
</consultarSaldoResponse>
```

### recibirTransferenciaInterbancaria(...)

Recibe una transferencia interbancaria por SOAP sin JWT. Internamente reutiliza la logica de:

```text
POST /api/interbancaria/entrante
```

Esto mantiene el registro en `transferencias_interbancarias`, movimiento de cuenta, auditoria y notificacion Telegram si aplica.

Request:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ban="http://bancogt.com/ws/banco">
  <soapenv:Header/>
  <soapenv:Body>
    <ban:recibirTransferenciaInterbancariaRequest>
      <ban:TransactionID>EXT-20260530-001</ban:TransactionID>
      <ban:cuentaOrigen>EXT123456</ban:cuentaOrigen>
      <ban:swiftOrigen>GTTBXXXX</ban:swiftOrigen>
      <ban:cuentaDestino>GT17798309563044741</ban:cuentaDestino>
      <ban:swiftDestino>BIGT2026</ban:swiftDestino>
      <ban:NombreOrigen>Cliente Externo</ban:NombreOrigen>
      <ban:monto>125.50</ban:monto>
      <ban:descripcion>Transferencia SOAP</ban:descripcion>
    </ban:recibirTransferenciaInterbancariaRequest>
  </soapenv:Body>
</soapenv:Envelope>
```

Respuesta confirmada:

```xml
<recibirTransferenciaInterbancariaResponse>
  <resultado>APROBADO</resultado>
</recibirTransferenciaInterbancariaResponse>
```

Respuesta rechazada:

```xml
<recibirTransferenciaInterbancariaResponse>
  <resultado>RECHAZADO</resultado>
</recibirTransferenciaInterbancariaResponse>
```

## Variables usadas

```env
LOCAL_BANK_SWIFT=BIGT2026
LOCAL_BANK_NAME=Banco Industrial
PUBLIC_BACKEND_URL=https://bancoerp-production.up.railway.app
```

Si `PUBLIC_BACKEND_URL` no existe, el servicio intenta usar `RAILWAY_PUBLIC_DOMAIN` o `localhost`.

## Logs

El backend escribe logs con estos prefijos:

```text
[SOAP] servicio iniciado
[SOAP] operacion ejecutada
```

Los errores de transferencia SOAP se registran en auditoria como modulo `SOAP`.
