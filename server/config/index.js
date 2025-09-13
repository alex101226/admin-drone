import dev from './development.js'
import prod from './production.js'

const env = process.env.NODE_ENV || 'development'

const config = env === 'production' ? prod : dev

export default config