/**
 * Configurar WebSockets para el dashboard de pedidos.
 * Maneja la comunicación en tiempo real de pedidos.
 */
function setupPedidosSockets(io) {
    io.on('connection', (socket) => {
        console.log(`🔌 Cliente conectado: ${socket.id}`);

        // Unirse a sala de tienda aislada por storeId y rol ('pedidos' o 'admin')
        socket.on('join-store-room', (data) => {
            const { storeId, role } = data || {};
            const sessionStoreId = socket.request.session?.storeId;

            // Validar que el usuario autenticado pertenezca a la tienda (o sea superadmin o similar si lo soportara, aquí validamos storeId)
            if (storeId && sessionStoreId && String(storeId) === String(sessionStoreId)) {
                const roomName = `store_${storeId}_${role || 'pedidos'}`;
                socket.join(roomName);
                console.log(`🔌 Cliente ${socket.id} se unió a la sala multi-tenant: ${roomName}`);
            } else {
                console.warn(`⚠️ Cliente ${socket.id} intentó unirse a store_${storeId} sin autorización (sesión: ${sessionStoreId})`);
            }
        });

        // Fallbacks heredados
        socket.join('pedidos');
        socket.on('join-admin', (data) => {
            socket.join('admin');
            if (data && data.storeId) {
                socket.join(`store_${data.storeId}_admin`);
            }
        });

        // Cuando la cocina confirma que recibió el pedido
        socket.on('pedido-recibido', (data) => {
            console.log(`✅ Pedido ${data.orderId} recibido por cocina`);
        });

        // Desconexión
        socket.on('disconnect', () => {
            console.log(`🔌 Cliente desconectado: ${socket.id}`);
        });
    });

    console.log('🔌 WebSockets de pedidos multi-tenant configurados');
}

module.exports = setupPedidosSockets;
