import 'dotenv/config'
import { initDb } from './db'
import app from './app'
import { PORT } from './config'

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`ProqrIQ server running on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err)
    process.exit(1)
  })
