/**
 * Real-Time Order Stream Service (Server-Sent Events)
 * Delivers instantaneous (<50ms) order alerts to all active admin browser tabs.
 */

const clients = new Set();

export function addOrderStreamClient(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable proxy buffering for instant delivery
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  const client = {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    res,
    user: req.user,
  };

  clients.add(client);

  // Send initial handshake
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

  // Heartbeat every 20 seconds to keep connection alive across all firewalls & proxies
  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAliveTimer);
      clients.delete(client);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    clients.delete(client);
  });
}

export function broadcastNewOrder(order) {
  if (!order || clients.size === 0) return;

  const customerName = order.user?.name || order.addressSnapshot?.name || 'A customer';
  const total = Number(order.grandTotal || 0).toLocaleString('en-IN');
  const itemsCount = order.items?.length || 1;

  const orderCatIds = new Set(
    (order.items || []).map((i) => i.product?.categoryId || i.categoryId).filter(Boolean)
  );

  const payload = JSON.stringify({
    type: 'NEW_ORDER',
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      total,
      customerName,
      itemsCount,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      url: `/admin/orders/${order.id}`,
      createdAt: order.createdAt,
    },
  });

  for (const client of clients) {
    try {
      const u = client.user;
      // Category scoping check
      if (u) {
        const assigned = Array.isArray(u.assignedCategoryIds) ? u.assignedCategoryIds : [];
        const isScoped = u.staffRole === 'CATEGORY_ADMIN' || assigned.length > 0;
        if (isScoped && orderCatIds.size > 0 && !assigned.some((cid) => orderCatIds.has(cid))) {
          continue; // Skip admin if order has no items in their category
        }
      }

      client.res.write(`data: ${payload}\n\n`);
    } catch (err) {
      console.warn('[SSE] Error broadcasting to client:', err.message);
      clients.delete(client);
    }
  }
}
