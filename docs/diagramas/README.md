# Diagramas tecnicos BancoGT ERP

Estos archivos son Mermaid real, listos para pegar en Markdown, Mermaid Live Editor, VS Code con extension Mermaid o Mermaid CLI.

## Archivos

- `01_flujo_general.mmd`: flujo funcional del sistema.
- `02_arquitectura.mmd`: arquitectura de despliegue Hostinger, Railway, PostgreSQL y MongoDB Atlas.
- `03_clases.mmd`: clases de dominio, servicios y controladores.
- `04_er_postgresql_mongodb.mmd`: entidad-relacion de PostgreSQL y colecciones MongoDB como almacenamiento no relacional.
- `05_casos_uso.mmd`: casos de uso del ERP bancario.

Tambien se generaron los PNG correspondientes:

- `01_flujo_general.png`
- `02_arquitectura.png`
- `03_clases.png`
- `04_er_postgresql_mongodb.png`
- `05_casos_uso.png`

## Notas de modelo

- `Beneficiario` aparece como clase conceptual porque no se encontro tabla fisica dedicada; el sistema usa `cuenta_destino`, `numero_cuenta_destino` y `banco_destino_swift`.
- Las colecciones `usuarios_telegram`, `notificaciones_telegram` y `logs_telegram` pertenecen a MongoDB Atlas y no forman parte del modelo relacional PostgreSQL.
- El flujo interbancario usa el formato estandar con `TransactionID`, `cuentaOrigen`, `swiftOrigen`, `cuentaDestino`, `swiftDestino`, `NombreOrigen`, `monto` y `descripcion`.

## Exportar a PNG con Mermaid CLI

Si tienes Mermaid CLI instalado:

```powershell
mmdc -i docs/diagramas/01_flujo_general.mmd -o docs/diagramas/01_flujo_general.png
mmdc -i docs/diagramas/02_arquitectura.mmd -o docs/diagramas/02_arquitectura.png
mmdc -i docs/diagramas/03_clases.mmd -o docs/diagramas/03_clases.png
mmdc -i docs/diagramas/04_er_postgresql_mongodb.mmd -o docs/diagramas/04_er_postgresql_mongodb.png
mmdc -i docs/diagramas/05_casos_uso.mmd -o docs/diagramas/05_casos_uso.png
```
