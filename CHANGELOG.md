# Registro de Actualizaciones (Changelog)

## v3.6.0 — Chat Pro: Asignación de Agentes, Favoritos, Archivado y Sincronización en Vivo
- **Asignación de Operadores/Agentes en Tiempo Real:** Selector de agentes integrado en la cabecera del chat activo y en la barra lateral de información. Nuevas columnas `assigned_to` y `assigned_name` en base de datos, con eventos WebSocket `chat-assign`.
- **Bandeja de Favoritos y Archivados Funcional:** Implementación completa del filtro `setFilter()` con aislamiento estricto de chats activos vs archivados, botones directos en la cabecera y menú contextual rápido.
- **Contadores Badge Centralizados:** Nuevo endpoint `GET /api/chats/counts` para actualización inmediata de contadores en vivo (*Mi bandeja*, *Favoritos*, *Archivados*, *Mías*, *Sin asignar*).
- **Corrección de Carga en Chat Pro:** Reparado error de sintaxis en `onChatOpened` que impedía la inicialización de `window.ChatProInstance` en el navegador.
- **Despliegue (Docker):** Compilación y publicación multi-plataforma de la imagen oficial `alfredobartaburu/urubot:v3.6` y `latest` para `linux/amd64`.

## v3.5.0 — Bandeja Estilo Chatwoot, Reproductor In-line y Resiliencia en Simulación
- **Bandeja de Entrada Estilo Chatwoot:** Filtro de conversaciones por pestañas (*Todos*, *Mías*, *Sin asignar*) con contadores badge en vivo y foco automático en caja de texto.
- **Reproductor de Audio Compacto In-line:** Nuevo reproductor para audios y notas de voz con control de velocidad (1x, 1.5x, 2x), barra interactiva de reproducción, descarga y tiempo transcurrido.
- **Tags de Identificación Claros:** Nuevos badges visuales para remitentes en la conversación (📌 Nota Privada, 👤 Operador, 🤖 Asistente IA).
- **Normalizador Inteligente de Multimedia:** Reconocimiento y transformación automática de URLs compartidas de Google Drive y Dropbox a enlaces directos para fichas de catálogo.
- **Resiliencia Multimodal en Simulación:** Manejo seguro en `enviar_foto_producto` que renderiza las tarjetas de producto en el simulador sin requerir conexión activa de socket a WhatsApp.
- **Despliegue (Docker):** Compilación y publicación multi-plataforma de la imagen `alfredobartaburu/urubot:v3.5` y `latest` para `linux/amd64`.

## v3.4.0 — Catálogo Moderno, Modal de Ficha Técnica y Sincronización Google Sheets
- **Tarjetas Modernas de Catálogo:** Rediseño con soporte de imágenes y fichas técnicas de productos y servicios.
- **Sincronización con Google Sheets:** Mapeo automático de columnas, sincronización de imágenes, SKU y compatibilidad con Google Drive.
- **Despliegue (Docker):** Compilación y publicación de la imagen `alfredobartaburu/urubot:v3.4`.

## v3.3.0 — Simulador Multimodal (Imágenes, Audio Avanzado y Modo Hostel)
- **Soporte Completo de Imágenes en Simulador:** Subida de fotos vía botón 📎, Drag & Drop y pegado desde portapapeles (`Ctrl+V`), previsualización antes de enviar y análisis con modelos de visión (`visionService`).
- **Renderizado de Fotos Despachadas por el Bot:** La herramienta `enviar_foto_producto` devuelve metadatos de las fotos de catálogo para mostrarlas como tarjetas interactivas de producto en el simulador.
- **Mejoras en Audio del Simulador:** Reproductor interactivo `<audio controls>` en la burbuja del usuario, etiqueta visual de transcripción Whisper (`📝 Transcripción`) y cronómetro en vivo de grabación.
- **Soporte de Reservas de Hostel en Simulación:** Integración completa de `result.booking` con creación de reservas y emisión por WebSockets en `/api/simulate`.
- **Herramientas de Operador:** Botón para reiniciar conversación / borrar memoria en 1 clic (`POST /api/simulate/reset`) e indicador de telemetría de latencia de IA.
- **Despliegue (Docker):** Compilación y publicación de la imagen `alfredobartaburu/urubot:v3.3` y `latest` para `linux/amd64`.
- **Seguridad en WebSockets:** Se implementó autenticación estricta con `express-session` en los sockets de pedidos, evitando cruces de datos entre tiendas.
- **Rendimiento Masivo en Excel:** Se envolvió el procesamiento y la inserción de registros de Excel en una transacción única de SQLite, reduciendo exponencialmente los bloqueos I/O y tiempos de importación.
- **Resiliencia de IA:** Se añadió un control de `timeout` (20 segundos) a las peticiones del LLM (LangChain) con mensajes automáticos de fallback ante caídas de proveedores (OpenAI/Anthropic).
- **Protección de API Keys (Rate Limiting):** Se implementó un límite de peticiones de IA por inquilino (`storeRateLimits`), bloqueando abusos e impidiendo que un atacante consuma la cuota global del SaaS.
- **Correcciones Defensivas Múltiples:**
  - Migración a generación de hashes asíncronos (`await bcrypt.hash`) para evitar bloqueos del servidor.
  - Parametrización en consultas PRAGMA SQLite (`table_info(?)`) contra inyección SQL.
  - Limpieza rigurosa garantizada (`try...finally`) de archivos temporales Excel, evitando saturar el disco.
- **Despliegue (Docker):** Compilación y publicación exitosa de la imagen oficial `alfredobartaburu/urubot:v2.5` en Docker Hub.

## v2.1.0 — Servicios, Landing Dinámico y Docker Release
- **Soporte de Servicios:** Se extendió el modelo de datos y el catálogo para diferenciar Productos y Servicios (incluyendo campos de `is_service` y `duration`).
- **Importación/Exportación Excel:** Se actualizaron las plantillas y el mapeo de columnas para incluir "Es Servicio" y "Duración (min)".
- **Mejoras UI Admin & Superadmin:** 
  - Se agrupó "Productos" y "Servicios" bajo un menú desplegable ("📦 Catálogo") en el panel.
  - Corrección de anchos máximos (`max-width: 1100px`) y comportamiento de pestañas activas.
  - Mejoras de visualización en el menú del panel de Superadmin.
- **Landing Page Dinámica:** Los planes de precios (Gratis, Pro, Enterprise) ahora se obtienen directamente de la tabla `saas_plans` en la base de datos, en lugar de estar estáticos. La grilla CSS se actualizó para 3 columnas con `auto-fit`.
- **Despliegue (Docker):** Construcción exitosa y subida de la imagen oficial `alfredobartaburu/urubot:v1.0` a Docker Hub.


## v2.0.0 — Expansión Multi-media, Multi-negocio, Multi-BD

### Renombrado del Proyecto
- Renombrado de "Wapitzz" a "WaBot SaaS" para reflejar la naturaleza genérica multi-negocio
- Actualizados todos los logs, títulos y referencias en el código

### Soporte de Medios (Imágenes y Videos)
- El bot ahora puede recibir y enviar imágenes y videos por WhatsApp
- Integración con IA de visión (GPT-4o Vision / Gemini Vision) para analizar fotos
- Almacenamiento local de medios con servicio `mediaStore.js`
- Las fotos adjuntas aparecen en las tarjetas de pedidos de cocina

### Multi-negocio (Genérico)
- Plantillas predefinidas para diferentes tipos de negocio:
  - Pizzería, Restaurante, Farmacia, Tienda, Floristería, Panadería, Carnicería
- System prompt dinámico que se adapta al tipo de negocio
- Configuración de emoji temático, moneda y mensaje de bienvenida personalizado
- Seed genérico que funciona para cualquier tipo de negocio

### Conexión de Base de Datos Externas
- Soporte para MySQL, PostgreSQL y SQLite externo
- Conector multi-BD con interfaz común
- Configuración persistente de conexión (guardada en settings)
- UI de mapeo visual de columnas para importar productos
- Preview antes de importar

### Mejoras Adicionales
- Agregadas dependencias `mysql2` y `pg` para soporte multi-BD
- Mejoras en la documentación interna

---

## v1.x — Funcionalidades Originales

### 1. Sistema Anti-ban de WhatsApp (Baileys)
- Rate Limit y Cola Global con delay de 3 segundos
- Exponential Backoff para reconexiones
- Variación de Texto con caracteres invisibles
- Presence Dinámico (available → composing → paused → unavailable)
- Reconocimiento de Navegador como Chrome/Ubuntu

### 2. Identificación de Clientes (IA y Frontend)
- Recopilación activa del nombre del cliente
- Cruce de datos con pushName de WhatsApp
- UI limpia en Panel de Chats

### 3. Contenerización
- Dockerfile optimizado para Alpine Linux
- Docker Compose para desarrollo y producción
