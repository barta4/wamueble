# Alcance del Proyecto: WaBot SaaS — Plataforma de Automatización Comercial con IA para WhatsApp

## 1. Visión del Producto y Modelo de Negocio
**WaBot SaaS** es una solución multitenant de automatización comercial, atención al cliente y gestión de pedidos/citas por WhatsApp impulsada por Inteligencia Artificial de última generación.

- **Modelo de Negocio:** Suscripción mensual SaaS (Alquiler de Software + Opción Kiosk para tablets de local/cocina).
- **Objetivo:** Eliminar la atención manual repetitiva en WhatsApp, tomar pedidos/citas/reservas automáticamente con IA y sincronizarlos en tiempo real con el panel del negocio y su personal de cocina/despacho.

---

## 2. Soporte Multivertical

El sistema adapta su comportamiento, terminología y modelos de datos según el tipo de comercio:

1. **🍕 Gastronomía (Pizzerías, Restaurantes, Cafeterías, Heladerías):**
   - Gestión de catálogo de productos, combos y acompañamientos.
   - Integración con Google Maps para cálculo exacto de distancia y costos de envío.
   - Pantalla de Cocina / Kiosk (`/pedidos`) en tiempo real.
2. **🏥 Salud y Servicios (Clínicas, Consultorios, Médicos, Salones):**
   - Agendamiento automático de citas y consultas.
   - Asignación de doctores/profesionales y franjas de horarios (`slot_duration`).
   - Gestión de turnos y calendario interactivo.
3. **🏨 Alojamiento (Hostels, Posadas, Hoteles):**
   - Reservas de habitaciones privadas o camas compartidas.
   - Consulta de disponibilidad y cálculo de tarifas por noches (Check-in / Check-out).
4. **🛍️ Retail y Comercio General:**
   - Envío de fotografías de productos directamente al WhatsApp del cliente.
   - Consulta de stock, precios y promociones.

---

## 3. Cerebro Cognitivo de IA (LangChain & Function Calling)

- **Orquestador:** Agente inteligente basado en LangChain con soporte multi-proveedor resiliente (`OpenAI GPT-4o`, `Google Gemini 2.0 Flash`, `Anthropic Claude Sonnet 4`).
- **Inyección de Contexto Dinámico:** El agente consulta en tiempo real el catálogo del local, las políticas del negocio y el historial previo de compras del cliente.
- **Herramientas de Ejecución (Function Calling):**
  - `calcular_distancia_km`: Cálculo logístico vía Google Maps.
  - `verificar_disponibilidad`: Chequeo de agenda para clínicas/turnos.
  - `verificar_disponibilidad_hostel`: Chequeo de disponibilidad de camas/habitaciones.
  - `enviar_foto_producto`: Despacho de imágenes multimedia por WhatsApp.
- **🪄 Agente Generador Mágico de Prompts:** Meta-agente integrado que redacta automáticamente System Prompts profesionales en 5 secciones para usuarios que no poseen experiencia en Prompt Engineering.

---

## 4. Integración Dual de WhatsApp

1. **⚡ Baileys (Código QR Nativo):** Generación e instanciación directa del código QR en el navegador en 1 clic, sin necesidad de servicios de terceros.
2. **🏢 Meta Cloud API Oficial:** Integración vía Access Token y Phone Number ID para empresas que requieren canales oficiales de Meta.

---

## 5. Arquitectura Multi-Tenant y Seguridad

- **Aislamiento de Base de Datos:** Todos los registros (pedidos, citas, productos, clientes, salas) están estrictamente indexados por `store_id`.
- **Canales de Tiempo Real Aislados (WebSockets):** Emisión a salas privadas de Socket.io (`store_${storeId}_pedidos` y `store_${storeId}_admin`), asegurando que ningún comercio reciba notificaciones de otro local.
- **Control de Acceso (RBAC):** Autenticación mediante roles (`user`, `admin`, `superadmin`) y middleware de seguridad (`requireAuth`, `requireSuperAdmin`).

---

## 6. Experiencia de Usuario: Onboarding & Simulador

- **Onboarding en 2 Pasos Inteligentes:**
  - **Paso 1:** Seleccionador visual de rubro por tarjetas + Nombre + Prompt con IA + Casilla de autosembrado de catálogo de muestra (`seedCatalog`).
  - **Paso 2:** Conexión directa por Código QR + Enlace al Simulador Web.
- **Simulador Web Interactivo (`/simulator`):** Entorno de pruebas inmediato en el navegador con soporte para mensajes de texto y transcripción de notas de voz (`AudioService`).

---

## 7. Herramientas de Integración Externa

- **Importador/Exportador masivo:** Procesamiento de catálogos mediante archivos Excel (`.xlsx`, `.xls`) y CSV con mapeo dinámico de columnas.
- **Conector a Bases de Datos Externas (`/api/db-connect`):** Conexión directa a MySQL, PostgreSQL y SQLite para importar inventarios existentes.