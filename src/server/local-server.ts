import express from 'express';
import cors from 'cors';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentMemory } from '../core/agent-memory.js';
import { createApiRouter } from './api-router.js';

export class LocalServer {
  private app: express.Application;
  private server?: http.Server;
  private memory: AgentMemory;
  private port: number;

  constructor(memory: AgentMemory, port: number = 50094) {
    this.memory = memory;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.use('/api', createApiRouter(this.memory));

    // Resolve studio dist path
    const studioDist = path.resolve(process.cwd(), 'src/studio/dist');
    if (fs.existsSync(studioDist)) {
      this.app.use(express.static(studioDist));
      this.app.get('*', (_req, res) => {
        res.sendFile(path.join(studioDist, 'index.html'));
      });
    } else {
      // Fallback status page if studio is not yet built
      this.app.get('/', (_req, res) => {
        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>AgentMem API & Studio</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
                h1 { color: #38bdf8; }
                .card { background: #1e293b; padding: 24px; border-radius: 12px; margin-top: 20px; border: 1px solid #334155; }
                a { color: #818cf8; text-decoration: none; }
                code { background: #020617; padding: 4px 8px; border-radius: 6px; }
              </style>
            </head>
            <body>
              <h1>AgentMem Memory Core Active</h1>
              <p>REST API running at port ${this.port}. Explore endpoints:</p>
              <div class="card">
                <ul>
                  <li><a href="/api/health">/api/health</a> - Engine Health</li>
                  <li><a href="/api/stats">/api/stats</a> - Memory Metrics</li>
                  <li><a href="/api/graph">/api/graph</a> - Visual Knowledge Graph JSON</li>
                  <li><a href="/api/entities">/api/entities</a> - Entities CRUD</li>
                  <li><a href="/api/episodes">/api/episodes</a> - Chronological Sessions</li>
                </ul>
              </div>
            </body>
          </html>
        `);
      });
    }
  }

  public async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}
