const express = require('express');
const {
    getResumenERP,
    getResumenAuditoriaERP,
    listarAuditoriaERP,
    listarBancosExternosERP,
    listarCuentasERP,
    listarInterbancariasERP
} = require('../controllers/adminController');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();
const rolesERP = ['ADMIN', 'CAJERO', 'GERENTE'];

router.use(authenticateToken);
router.use(authorize(...rolesERP));

router.get('/resumen', getResumenERP);
router.get('/cuentas', listarCuentasERP);
router.get('/interbancarias', listarInterbancariasERP);
router.get('/bancos-externos', listarBancosExternosERP);
router.get('/auditoria', authorize('ADMIN', 'GERENTE'), listarAuditoriaERP);
router.get('/auditoria/resumen', authorize('ADMIN', 'GERENTE'), getResumenAuditoriaERP);

module.exports = router;
