const nodemailer = require('nodemailer');
const Store = require('../models/Store');
const WhatsAppService = require('./whatsapp');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
        auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        } : undefined
    });
    return transporter;
}

function parseEvents(store) {
    if (!store) return ['new', 'ready'];
    if (store.notification_events) {
        try {
            if (typeof store.notification_events === 'string') {
                return JSON.parse(store.notification_events);
            }
            return store.notification_events;
        } catch (e) {
            return ['new', 'ready'];
        }
    }
    return ['new', 'ready'];
}

function formatItems(items) {
    if (!items || !Array.isArray(items)) return '';
    return items.map(i => {
        let line = `${i.quantity || 1}x ${i.product_name || i.producto || ''}`;
        if (i.details) line += ` (${i.details})`;
        return line;
    }).join('\n');
}

function buildWhatsAppMessage(event, order, store) {
    const itemsList = formatItems(order.items);
    if (event === 'new') {
        return `🆕 *Nuevo pedido* (N° ${order.order_number})\n` +
            `🏪 ${store.name}\n` +
            (order.customer_name ? `👤 Cliente: ${order.customer_name}\n` : '') +
            `\n📦 Items:\n${itemsList}\n\n` +
            `📍 Dirección: ${order.address || '—'}\n` +
            `💰 Pago: ${order.payment_method || '—'}\n` +
            `💵 Total: $${order.total || 0}`;
    }
    // ready
    return `✅ *Pedido listo para entregar* (N° ${order.order_number})\n` +
        `🏪 ${store.name}\n` +
        (order.customer_name ? `👤 Cliente: ${order.customer_name}\n` : '') +
        `\n📦 Items:\n${itemsList}\n\n` +
        `📍 Dirección: ${order.address || '—'}\n` +
        `💰 Pago: ${order.payment_method || '—'}`;
}

function buildEmailHtml(event, order, store) {
    const itemsList = formatItems(order.items);
    const title = event === 'new' ? '🆕 Nuevo Pedido Recibido' : '✅ Pedido Listo para Entregar';
    const bgColor = event === 'new' ? '#2563eb' : '#16a34a';
    const itemsHtml = (order.items || []).map(i =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.quantity || 1}x</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.product_name || i.producto || ''}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;">$${i.unit_price || 0}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.details || ''}</td></tr>`
    ).join('');

    return `<!DOCTYPE html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#f4f4f5;margin:0;padding:20px;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:${bgColor};color:#fff;padding:20px 24px;">
    <h2 style="margin:0;font-size:20px;">${title}</h2>
    <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">${store.name} — Pedido #${order.order_number}</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr><td style="padding:4px 0;color:#555;">Cliente:</td><td style="padding:4px 0;font-weight:600;">${order.customer_name || '—'}</td></tr>
      <tr><td style="padding:4px 0;color:#555;">Dirección:</td><td style="padding:4px 0;font-weight:600;">${order.address || '—'}</td></tr>
      <tr><td style="padding:4px 0;color:#555;">Pago:</td><td style="padding:4px 0;font-weight:600;">${order.payment_method || '—'}</td></tr>
      <tr><td style="padding:4px 0;color:#555;">Total:</td><td style="padding:4px 0;font-weight:600;">$${order.total || 0}</td></tr>
    </table>
    <h3 style="font-size:15px;margin:0 0 8px;">Productos</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Cant.</th>
        <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Producto</th>
        <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Precio</th>
        <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">Detalles</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>
  <div style="padding:12px 24px;background:#f9fafb;font-size:12px;color:#999;text-align:center;">
    Aviso automático de ${store.name} · WaBot SaaS
  </div>
</div>
</body></html>`;
}

const NotificationService = {
    /**
     * Dispara el aviso a los destinos configurados del local.
     * @param {string} event - 'new' (toma de pedido) o 'ready' (pedido listo)
     * @param {object} order - Pedido con items, customer_name, etc
     * @param {number} storeId - ID del local
     */
    async notify(event, order, storeId) {
        try {
            const store = Store.getById(storeId);
            if (!store) return;

            const events = parseEvents(store);
            if (!events.includes(event)) return;

            const promises = [];

            if (store.notify_phone) {
                promises.push(this._sendWhatsApp(event, order, store));
            }

            if (store.notify_email) {
                promises.push(this._sendEmail(event, order, store));
            }

            await Promise.allSettled(promises);
        } catch (error) {
            console.error(`⚠️ Error en NotificationService.notify (${event}):`, error.message);
        }
    },

    async _sendWhatsApp(event, order, store) {
        try {
            const message = buildWhatsAppMessage(event, order, store);
            await WhatsAppService.sendTextMessage(store.notify_phone, message, store.id);
            console.log(`📩 Aviso WhatsApp (${event}) enviado a ${store.notify_phone}`);
        } catch (err) {
            console.error(`⚠️ Error enviando aviso WhatsApp a ${store.notify_phone}:`, err.message);
        }
    },

    async _sendEmail(event, order, store) {
        try {
            const tr = getTransporter();
            if (!tr) {
                console.warn('⚠️ SMTP no configurado (SMTP_HOST vacío). No se envía email de aviso.');
                return;
            }
            const fromName = process.env.SMTP_FROM_NAME || 'WaBot Avisos';
            const fromEmail = process.env.SMTP_FROM_EMAIL || 'no-reply@wabot.app';
            const subject = event === 'new'
                ? `🆕 Nuevo Pedido #${order.order_number} — ${store.name}`
                : `✅ Pedido Listo #${order.order_number} — ${store.name}`;
            const html = buildEmailHtml(event, order, store);

            await tr.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to: store.notify_email,
                subject,
                html
            });
            console.log(`📧 Aviso email (${event}) enviado a ${store.notify_email}`);
        } catch (err) {
            console.error(`⚠️ Error enviando aviso email a ${store.notify_email}:`, err.message);
        }
    }
};

module.exports = NotificationService;
