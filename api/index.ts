import 'dotenv/config'
import { initDb } from '../server/src/db'
import app from '../server/src/app'

let initialised = false

export default async function handler(req: any, res: any) {
  if (!initialised) {
    await initDb()
    initialised = true
  }
  return app(req, res)
}
