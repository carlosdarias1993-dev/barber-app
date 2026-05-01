# Barber App

Aplicacion web sencilla para gestionar citas de una barberia.

Incluye:

- Agenda de citas por fecha.
- Clientes con telefono unico.
- Autocompletado de clientes.
- Servicios con duracion y precio.
- Horarios disponibles/ocupados en intervalos de 30 minutos.
- Estados de cita: pendiente, confirmada, cancelada y completada.
- Total estimado del dia.
- Base de datos SQLite local.

## Requisitos

- Node.js 24 o superior.
- npm.

La app usa `node:sqlite`, incluido en Node.js moderno. Por eso se recomienda Node 24+.

## Instalacion

```bash
npm install
```

## Ejecutar en local

```bash
npm start
```

La app quedara disponible en:

```txt
http://localhost:3000
```

Tambien puedes usar:

```bash
npm run dev
```

## Base de datos

La base SQLite se crea automaticamente en:

```txt
barber.db
```

En este proyecto local, la ruta completa habitual es:

```txt
C:\proyectos\barber-app\barber.db
```

El archivo `barber.db` esta ignorado por Git para evitar subir datos reales o datos de prueba.

## Resetear datos

Para borrar todas las citas y clientes sin eliminar la estructura de la base de datos:

```bash
npm run reset-db
```

Esto elimina datos de:

- `appointments`
- `clients`

Y mantiene:

- tablas
- servicios
- precios
- configuracion
- codigo de la app

## Scripts disponibles

```bash
npm start
```

Arranca el servidor Express.

```bash
npm run dev
```

Arranca el servidor igual que `start`.

```bash
npm run reset-db
```

Limpia citas y clientes de la base SQLite.

## Despliegue online

Esta app es un servidor Node.js con Express y SQLite local. Necesita un proceso web persistente y, si quieres conservar datos entre despliegues, almacenamiento persistente para el archivo `barber.db`.

### Plataforma recomendada: Railway

Recomiendo **Railway** para esta app porque encaja bien con:

- servidor Express tradicional
- variable `PORT` automatica
- despliegue desde GitHub
- posibilidad de usar volumen persistente para SQLite
- configuracion sencilla para proyectos Node.js

Pasos generales:

1. Sube el proyecto a GitHub.
2. Crea un nuevo proyecto en Railway.
3. Selecciona el repositorio.
4. Railway detectara Node.js.
5. Usa estos comandos:

```txt
Install command: npm install
Start command: npm start
```

6. Asegurate de usar Node.js 24 o superior.
7. Configura un volumen persistente si quieres conservar `barber.db` entre redeploys.

### Render

Render tambien sirve para esta app si usas un **Web Service** Node.js.

Configuracion:

```txt
Build command: npm install
Start command: npm start
```

Importante: para conservar SQLite en produccion necesitas un disco persistente. Sin disco persistente, los datos pueden perderse al redeplegar.

### Vercel

No recomiendo Vercel para esta app tal como esta, porque Vercel esta orientado a funciones serverless y frontends. Esta app usa:

- Express como servidor persistente.
- SQLite como archivo local.

Eso no encaja bien con almacenamiento local persistente en Vercel. Para usar Vercel seria mejor separar frontend y backend, y cambiar SQLite por una base externa.

## Notas de produccion

- No subas `barber.db` al repositorio.
- Haz copias de seguridad del archivo SQLite si contiene datos reales.
- Usa almacenamiento persistente en la plataforma elegida.
- Si vas a escalar a varios servidores, conviene migrar de SQLite a una base gestionada como PostgreSQL.
