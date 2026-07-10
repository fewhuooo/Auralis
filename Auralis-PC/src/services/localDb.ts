import Database from '@tauri-apps/plugin-sql';
import type { KnowledgeBlock } from '@/store/useBlockStore';
import type { Task } from '@/store/useTaskStore';

let db: any = null;

export const localDb = {
  async init() {
    try {
      // Check if Tauri is present. If window.__TAURI__ is not defined, immediately fall back.
      if (typeof window === 'undefined' || !(window as any).__TAURI__) {
        console.warn('[SQLite PC] Not running in Tauri context, using localStorage fallback.');
        db = 'localstorage';
        return;
      }
      db = await Database.load('sqlite:auralis.db');
      await this.createTables();
      await this.runMigrations();
      console.log('[SQLite PC] Database initialized and tables verified.');
    } catch (err) {
      console.error('[SQLite PC] Failed to initialize SQLite database, switching to localStorage fallback:', err);
      db = 'localstorage';
    }
  },

  async createTables() {
    if (!db || db === 'localstorage') return;
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS local_mutations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        entity_type TEXT,
        entity_id TEXT,
        action TEXT,
        payload TEXT,
        created_at INTEGER,
        sync_status TEXT DEFAULT 'pending'
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_blocks (
        id TEXT PRIMARY KEY,
        subject TEXT,
        title TEXT,
        preview TEXT,
        time TEXT,
        source TEXT,
        color TEXT,
        sync_status TEXT DEFAULT 'synced',
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        subject_id TEXT,
        source_file_id TEXT,
        tags TEXT,
        difficulty TEXT,
        mastery INTEGER DEFAULT 0,
        review_at TEXT,
        related_block_ids TEXT
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS task_blocks (
        id TEXT PRIMARY KEY,
        name TEXT,
        subject TEXT,
        desc TEXT,
        color TEXT,
        duration INTEGER,
        load TEXT,
        loadText TEXT,
        status TEXT,
        startTime TEXT,
        sync_status TEXT DEFAULT 'synced',
        is_deleted INTEGER DEFAULT 0,
        sync_version INTEGER DEFAULT 0,
        position TEXT DEFAULT '0',
        subject_id TEXT
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER,
        updated_at INTEGER
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER,
        session_id TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT,
        created_at INTEGER
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS source_files (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        name TEXT NOT NULL,
        file_path TEXT,
        file_type TEXT,
        file_size INTEGER,
        catalog_json TEXT,
        block_count INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY (subject_id) REFERENCES subjects(id)
      )
    `);
  },

  async runMigrations() {
    if (!db || db === 'localstorage') return;
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN sync_version INTEGER DEFAULT 0");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await db.execute("ALTER TABLE task_blocks ADD COLUMN sync_version INTEGER DEFAULT 0");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await db.execute("ALTER TABLE task_blocks ADD COLUMN position TEXT DEFAULT '0'");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN subject_id TEXT");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN source_file_id TEXT");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN tags TEXT");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN difficulty TEXT");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN mastery INTEGER DEFAULT 0");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN review_at TEXT");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE knowledge_blocks ADD COLUMN related_block_ids TEXT");
    } catch (e) {}
    try {
      await db.execute("ALTER TABLE task_blocks ADD COLUMN subject_id TEXT");
    } catch (e) {}
  },

  // Sync Metadata Key-Value helpers
  async getMetadata(key: string): Promise<string | null> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const meta = JSON.parse(localStorage.getItem('auralis_sync_metadata') || '{}');
      return meta[key] !== undefined ? String(meta[key]) : null;
    }
    const rows = await db.select('SELECT value FROM sync_metadata WHERE key = $1', [key]);
    if (rows && rows.length > 0) {
      return rows[0].value;
    }
    return null;
  },

  async setMetadata(key: string, value: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const meta = JSON.parse(localStorage.getItem('auralis_sync_metadata') || '{}');
      meta[key] = value;
      localStorage.setItem('auralis_sync_metadata', JSON.stringify(meta));
      return;
    }
    const exists = await db.select('SELECT key FROM sync_metadata WHERE key = $1', [key]);
    if (exists && exists.length > 0) {
      await db.execute('UPDATE sync_metadata SET value = $1 WHERE key = $2', [value, key]);
    } else {
      await db.execute('INSERT INTO sync_metadata (key, value) VALUES ($1, $2)', [key, value]);
    }
  },

  // Knowledge Block CRUD
  async getBlocks(subject?: string, subjectId?: string): Promise<KnowledgeBlock[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      let filtered = blocks.filter((b: any) => !b.is_deleted && b.is_deleted !== 1);
      if (subjectId) {
        filtered = filtered.filter((b: any) => b.subject_id === subjectId);
      } else if (subject) {
        filtered = filtered.filter((b: any) => b.subject === subject);
      }
      filtered.sort((a: any, b: any) => {
        const timeA = a.time || '';
        const timeB = b.time || '';
        return timeB.localeCompare(timeA);
      });
      return filtered.map((r: any) => ({
        id: r.id,
        subject: r.subject,
        title: r.title,
        preview: r.preview,
        time: r.time,
        source: r.source,
        color: r.color,
        sync_status: r.sync_status,
        sync_version: r.sync_version,
        is_deleted: r.is_deleted === true || r.is_deleted === 1,
        subjectId: r.subject_id || undefined,
        sourceFileId: r.source_file_id || undefined,
        tags: r.tags ? JSON.parse(r.tags) : [],
        difficulty: r.difficulty || undefined,
        mastery: r.mastery || 0,
        reviewAt: r.review_at || undefined,
        relatedBlockIds: r.related_block_ids ? JSON.parse(r.related_block_ids) : []
      }));
    }

    let query = 'SELECT * FROM knowledge_blocks WHERE is_deleted = 0';
    const params: any[] = [];
    if (subjectId) {
      query += ' AND subject_id = $1';
      params.push(subjectId);
    } else if (subject) {
      query += ' AND subject = $1';
      params.push(subject);
    }
    query += ' ORDER BY time DESC';
    const records = await db.select(query, params);
    return records.map((r: any) => ({
      id: r.id,
      subject: r.subject,
      title: r.title,
      preview: r.preview,
      time: r.time,
      source: r.source,
      color: r.color,
      sync_status: r.sync_status,
      sync_version: r.sync_version,
      is_deleted: r.is_deleted === 1,
      subjectId: r.subject_id || undefined,
      sourceFileId: r.source_file_id || undefined,
      tags: r.tags ? JSON.parse(r.tags) : [],
      difficulty: r.difficulty || undefined,
      mastery: r.mastery || 0,
      reviewAt: r.review_at || undefined,
      relatedBlockIds: r.related_block_ids ? JSON.parse(r.related_block_ids) : []
    }));
  },

  async saveBlock(block: KnowledgeBlock, syncStatus = 'synced', syncVersion = 0) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      const index = blocks.findIndex((b: any) => b.id === block.id);
      const isDeletedVal = block.is_deleted ? true : false;
      const versionVal = block.sync_version || syncVersion || 0;

      const mapped: any = {
        id: block.id,
        subject: block.subject,
        title: block.title,
        preview: block.preview,
        time: block.time,
        source: block.source,
        color: block.color,
        sync_status: syncStatus,
        is_deleted: isDeletedVal,
        sync_version: versionVal,
        subject_id: block.subjectId || null,
        source_file_id: block.sourceFileId || null,
        tags: block.tags ? JSON.stringify(block.tags) : '[]',
        difficulty: block.difficulty || null,
        mastery: block.mastery || 0,
        review_at: block.reviewAt || null,
        related_block_ids: block.relatedBlockIds ? JSON.stringify(block.relatedBlockIds) : '[]'
      };

      if (index !== -1) {
        blocks[index] = mapped;
      } else {
        blocks.push(mapped);
      }
      localStorage.setItem('auralis_knowledge_blocks', JSON.stringify(blocks));
      return;
    }

    const exists = await db.select('SELECT id FROM knowledge_blocks WHERE id = $1', [block.id]);
    const isDeletedVal = block.is_deleted ? 1 : 0;
    const versionVal = block.sync_version || syncVersion || 0;
    
    const subjectIdVal = block.subjectId || null;
    const sourceFileIdVal = block.sourceFileId || null;
    const tagsVal = block.tags ? JSON.stringify(block.tags) : '[]';
    const difficultyVal = block.difficulty || null;
    const masteryVal = block.mastery || 0;
    const reviewAtVal = block.reviewAt || null;
    const relatedBlockIdsVal = block.relatedBlockIds ? JSON.stringify(block.relatedBlockIds) : '[]';

    if (exists && exists.length > 0) {
      await db.execute(
        `UPDATE knowledge_blocks SET 
          subject = $1, title = $2, preview = $3, time = $4, source = $5, color = $6, sync_status = $7, is_deleted = $8, sync_version = $9,
          subject_id = $10, source_file_id = $11, tags = $12, difficulty = $13, mastery = $14, review_at = $15, related_block_ids = $16
         WHERE id = $17`,
        [
          block.subject, block.title, block.preview, block.time, block.source, block.color, syncStatus, isDeletedVal, versionVal,
          subjectIdVal, sourceFileIdVal, tagsVal, difficultyVal, masteryVal, reviewAtVal, relatedBlockIdsVal, block.id
        ]
      );
    } else {
      await db.execute(
        `INSERT INTO knowledge_blocks (id, subject, title, preview, time, source, color, sync_status, is_deleted, sync_version, subject_id, source_file_id, tags, difficulty, mastery, review_at, related_block_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          block.id, block.subject, block.title, block.preview, block.time, block.source, block.color, syncStatus, isDeletedVal, versionVal,
          subjectIdVal, sourceFileIdVal, tagsVal, difficultyVal, masteryVal, reviewAtVal, relatedBlockIdsVal
        ]
      );
    }
  },

  async deleteBlock(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      const index = blocks.findIndex((b: any) => b.id === id);
      if (index !== -1) {
        if (blocks[index].sync_status === 'pending_create') {
          blocks.splice(index, 1);
        } else {
          blocks[index].is_deleted = true;
          blocks[index].sync_status = 'pending_delete';
        }
        localStorage.setItem('auralis_knowledge_blocks', JSON.stringify(blocks));
      }
      return;
    }

    const record = await db.select('SELECT sync_status FROM knowledge_blocks WHERE id = $1', [id]);
    if (record && record[0] && record[0].sync_status === 'pending_create') {
      await db.execute('DELETE FROM knowledge_blocks WHERE id = $1', [id]);
    } else {
      await db.execute("UPDATE knowledge_blocks SET is_deleted = 1, sync_status = 'pending_delete' WHERE id = $1", [id]);
    }
  },

  async hardDeleteBlock(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      const filtered = blocks.filter((b: any) => b.id !== id);
      localStorage.setItem('auralis_knowledge_blocks', JSON.stringify(filtered));
      return;
    }
    await db.execute('DELETE FROM knowledge_blocks WHERE id = $1', [id]);
  },

  async getUnsyncedBlocks(): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      return blocks.filter((b: any) => b.sync_status !== 'synced');
    }
    return db.select("SELECT * FROM knowledge_blocks WHERE sync_status != 'synced'");
  },

  async markBlockSynced(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      const index = blocks.findIndex((b: any) => b.id === id);
      if (index !== -1) {
        blocks[index].sync_status = 'synced';
        localStorage.setItem('auralis_knowledge_blocks', JSON.stringify(blocks));
      }
      return;
    }
    await db.execute("UPDATE knowledge_blocks SET sync_status = 'synced' WHERE id = $1", [id]);
  },

  async mergeBlocksFromServer(serverBlocks: KnowledgeBlock[]) {
    await this.batchMergeBlocks(serverBlocks);
  },

  async batchMergeBlocks(serverBlocks: any[]) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const blocks: any[] = JSON.parse(localStorage.getItem('auralis_knowledge_blocks') || '[]');
      for (const block of serverBlocks) {
        if (!block.id) continue;
        
        const local = blocks.find((b: any) => b.id === block.id);
        const serverVer = block.syncVersion || block.sync_version || 0;
        
        if (block.isDeleted || block.is_deleted) {
          if (local) {
            if (local.sync_status !== 'synced') {
              const localVer = local.sync_version || 0;
              if (serverVer < localVer) {
                continue;
              }
            }
            await this.hardDeleteBlock(block.id);
          }
          continue;
        }
        
        if (local) {
          if (local.sync_status !== 'synced') {
            const localVer = local.sync_version || 0;
            if (serverVer < localVer) {
              continue;
            }
          }
        }
        
        const mappedBlock: KnowledgeBlock = {
          id: block.id,
          subject: block.subject,
          title: block.title,
          preview: block.preview,
          time: block.time,
          source: block.source,
          color: block.color,
          sync_version: serverVer,
          is_deleted: false,
          subjectId: block.subjectId || block.subject_id || undefined,
          sourceFileId: block.sourceFileId || block.source_file_id || undefined,
          tags: block.tags ? (typeof block.tags === 'string' ? JSON.parse(block.tags) : block.tags) : [],
          difficulty: block.difficulty || undefined,
          mastery: block.mastery || 0,
          reviewAt: block.reviewAt || block.review_at || undefined,
          relatedBlockIds: block.relatedBlockIds ? (typeof block.relatedBlockIds === 'string' ? JSON.parse(block.relatedBlockIds) : block.relatedBlockIds) : []
        };
        await this.saveBlock(mappedBlock, 'synced', serverVer);
      }
      return;
    }

    for (const block of serverBlocks) {
      if (!block.id) continue;
      
      const local = await db.select('SELECT sync_status, sync_version FROM knowledge_blocks WHERE id = $1', [block.id]);
      
      if (block.isDeleted || block.is_deleted) {
        if (local && local.length > 0) {
          if (local[0].sync_status !== 'synced') {
            const serverVer = block.syncVersion || block.sync_version || 0;
            const localVer = local[0].sync_version || 0;
            if (serverVer < localVer) {
              continue;
            }
          }
          await this.hardDeleteBlock(block.id);
        }
        continue;
      }
      
      if (local && local.length > 0) {
        if (local[0].sync_status !== 'synced') {
          const serverVer = block.syncVersion || block.sync_version || 0;
          const localVer = local[0].sync_version || 0;
          if (serverVer < localVer) {
            continue;
          }
        }
      }
      
      const mappedBlock: KnowledgeBlock = {
        id: block.id,
        subject: block.subject,
        title: block.title,
        preview: block.preview,
        time: block.time,
        source: block.source,
        color: block.color,
        sync_version: block.syncVersion || block.sync_version || 0,
        is_deleted: false,
        subjectId: block.subjectId || block.subject_id || undefined,
        sourceFileId: block.sourceFileId || block.source_file_id || undefined,
        tags: block.tags ? (typeof block.tags === 'string' ? JSON.parse(block.tags) : block.tags) : [],
        difficulty: block.difficulty || undefined,
        mastery: block.mastery || 0,
        reviewAt: block.reviewAt || block.review_at || undefined,
        relatedBlockIds: block.relatedBlockIds ? (typeof block.relatedBlockIds === 'string' ? JSON.parse(block.relatedBlockIds) : block.relatedBlockIds) : []
      };
      await this.saveBlock(mappedBlock, 'synced', block.syncVersion || block.sync_version || 0);
    }
  },

  // Task Block CRUD
  async getTasks(): Promise<Task[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      const filtered = tasks.filter((t: any) => !t.is_deleted && t.is_deleted !== 1);
      filtered.sort((a: any, b: any) => {
        const posA = a.position || '0';
        const posB = b.position || '0';
        return posA.localeCompare(posB);
      });
      return filtered.map((r: any) => ({
        id: r.id,
        name: r.name,
        subject: r.subject,
        desc: r.desc || '',
        color: r.color,
        duration: r.duration,
        load: r.load,
        loadText: r.loadText,
        status: r.status,
        startTime: r.startTime || undefined,
        sync_status: r.sync_status,
        sync_version: r.sync_version,
        is_deleted: r.is_deleted === true || r.is_deleted === 1,
        position: r.position || '0',
        subjectId: r.subject_id || undefined
      }));
    }

    const records = await db.select('SELECT * FROM task_blocks WHERE is_deleted = 0 ORDER BY position ASC');
    return records.map((r: any) => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      desc: r.desc || '',
      color: r.color,
      duration: r.duration,
      load: r.load,
      loadText: r.loadText,
      status: r.status,
      startTime: r.startTime || undefined,
      sync_status: r.sync_status,
      sync_version: r.sync_version,
      is_deleted: r.is_deleted === 1,
      position: r.position || '0',
      subjectId: r.subject_id || undefined
    }));
  },

  async saveTask(task: Task, syncStatus = 'synced', syncVersion = 0) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      const index = tasks.findIndex((t: any) => t.id === task.id);
      const isDeletedVal = task.is_deleted ? true : false;
      const versionVal = task.sync_version || syncVersion || 0;
      const positionVal = task.position || '0';

      const mapped: any = {
        id: task.id,
        name: task.name,
        subject: task.subject,
        desc: task.desc || '',
        color: task.color,
        duration: task.duration,
        load: task.load,
        loadText: task.loadText,
        status: task.status,
        startTime: task.startTime || null,
        sync_status: syncStatus,
        is_deleted: isDeletedVal,
        sync_version: versionVal,
        position: positionVal,
        subject_id: task.subjectId || null
      };

      if (index !== -1) {
        tasks[index] = mapped;
      } else {
        tasks.push(mapped);
      }
      localStorage.setItem('auralis_task_blocks', JSON.stringify(tasks));
      return;
    }

    const exists = await db.select('SELECT id FROM task_blocks WHERE id = $1', [task.id]);
    const isDeletedVal = task.is_deleted ? 1 : 0;
    const versionVal = task.sync_version || syncVersion || 0;
    const positionVal = task.position || '0';
    const subjectIdVal = task.subjectId || null;
    if (exists && exists.length > 0) {
      await db.execute(
        `UPDATE task_blocks SET 
          name = $1, subject = $2, desc = $3, color = $4, duration = $5, load = $6, loadText = $7, status = $8, startTime = $9, sync_status = $10, is_deleted = $11, sync_version = $12, position = $13, subject_id = $14
         WHERE id = $15`,
        [task.name, task.subject, task.desc || '', task.color, task.duration, task.load, task.loadText, task.status, task.startTime || null, syncStatus, isDeletedVal, versionVal, positionVal, subjectIdVal, task.id]
      );
    } else {
      await db.execute(
        `INSERT INTO task_blocks (id, name, subject, desc, color, duration, load, loadText, status, startTime, sync_status, is_deleted, sync_version, position, subject_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [task.id, task.name, task.subject, task.desc || '', task.color, task.duration, task.load, task.loadText, task.status, task.startTime || null, syncStatus, isDeletedVal, versionVal, positionVal, subjectIdVal]
      );
    }
  },

  async deleteTask(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      const index = tasks.findIndex((t: any) => t.id === id);
      if (index !== -1) {
        if (tasks[index].sync_status === 'pending_create') {
          tasks.splice(index, 1);
        } else {
          tasks[index].is_deleted = true;
          tasks[index].sync_status = 'pending_delete';
        }
        localStorage.setItem('auralis_task_blocks', JSON.stringify(tasks));
      }
      return;
    }

    const record = await db.select('SELECT sync_status FROM task_blocks WHERE id = $1', [id]);
    if (record && record[0] && record[0].sync_status === 'pending_create') {
      await db.execute('DELETE FROM task_blocks WHERE id = $1', [id]);
    } else {
      await db.execute("UPDATE task_blocks SET is_deleted = 1, sync_status = 'pending_delete' WHERE id = $1", [id]);
    }
  },

  async hardDeleteTask(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      const filtered = tasks.filter((t: any) => t.id !== id);
      localStorage.setItem('auralis_task_blocks', JSON.stringify(filtered));
      return;
    }
    await db.execute('DELETE FROM task_blocks WHERE id = $1', [id]);
  },

  async getUnsyncedTasks(): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      return tasks.filter((t: any) => t.sync_status !== 'synced');
    }
    return db.select("SELECT * FROM task_blocks WHERE sync_status != 'synced'");
  },

  async markTaskSynced(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      const index = tasks.findIndex((t: any) => t.id === id);
      if (index !== -1) {
        tasks[index].sync_status = 'synced';
        localStorage.setItem('auralis_task_blocks', JSON.stringify(tasks));
      }
      return;
    }
    await db.execute("UPDATE task_blocks SET sync_status = 'synced' WHERE id = $1", [id]);
  },

  async mergeTasksFromServer(serverTasks: Task[]) {
    await this.batchMergeTasks(serverTasks);
  },

  async batchMergeTasks(serverTasks: any[]) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const tasks: any[] = JSON.parse(localStorage.getItem('auralis_task_blocks') || '[]');
      for (const task of serverTasks) {
        if (!task.id) continue;
        
        const local = tasks.find((t: any) => t.id === task.id);
        const serverVer = task.syncVersion || task.sync_version || 0;
        
        if (task.isDeleted || task.is_deleted) {
          if (local) {
            if (local.sync_status !== 'synced') {
              const localVer = local.sync_version || 0;
              if (serverVer < localVer) {
                continue;
              }
            }
            await this.hardDeleteTask(task.id);
          }
          continue;
        }
        
        if (local) {
          if (local.sync_status !== 'synced') {
            const localVer = local.sync_version || 0;
            if (serverVer < localVer) {
              continue;
            }
          }
        }
        
        const mappedTask: Task = {
          id: task.id,
          name: task.name,
          subject: task.subject,
          desc: task.desc || '',
          color: task.color,
          duration: task.duration,
          load: task.load,
          loadText: task.loadText,
          status: task.status,
          startTime: task.startTime || undefined,
          sync_version: serverVer,
          is_deleted: false,
          position: task.position || '0',
          subjectId: task.subjectId || task.subject_id || undefined
        };
        await this.saveTask(mappedTask, 'synced', serverVer);
      }
      return;
    }

    for (const task of serverTasks) {
      if (!task.id) continue;
      
      const local = await db.select('SELECT sync_status, sync_version FROM task_blocks WHERE id = $1', [task.id]);
      
      if (task.isDeleted || task.is_deleted) {
        if (local && local.length > 0) {
          if (local[0].sync_status !== 'synced') {
            const serverVer = task.syncVersion || task.sync_version || 0;
            const localVer = local[0].sync_version || 0;
            if (serverVer < localVer) {
              continue;
            }
          }
          await this.hardDeleteTask(task.id);
        }
        continue;
      }
      
      if (local && local.length > 0) {
        if (local[0].sync_status !== 'synced') {
          const serverVer = task.syncVersion || task.sync_version || 0;
          const localVer = local[0].sync_version || 0;
          if (serverVer < localVer) {
            continue;
          }
        }
      }
      
      const mappedTask: Task = {
        id: task.id,
        name: task.name,
        subject: task.subject,
        desc: task.desc || '',
        color: task.color,
        duration: task.duration,
        load: task.load,
        loadText: task.loadText,
        status: task.status,
        startTime: task.startTime || undefined,
        sync_version: task.syncVersion || task.sync_version || 0,
        is_deleted: false,
        position: task.position || '0',
        subjectId: task.subjectId || task.subject_id || undefined
      };
      await this.saveTask(mappedTask, 'synced', task.syncVersion || task.sync_version || 0);
    }
  },

  async addLocalMutation(clientId: string, entityType: string, entityId: string, action: string, payload: any) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const mutations: any[] = JSON.parse(localStorage.getItem('auralis_local_mutations') || '[]');
      const maxId = mutations.reduce((max, m) => m.id > max ? m.id : max, 0);
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const createdAt = Date.now();
      const newMutation = {
        id: maxId + 1,
        client_id: clientId,
        entity_type: entityType,
        entity_id: entityId,
        action: action,
        payload: payloadStr,
        created_at: createdAt,
        sync_status: 'pending'
      };
      mutations.push(newMutation);
      localStorage.setItem('auralis_local_mutations', JSON.stringify(mutations));
      return;
    }

    const payloadStr = JSON.stringify(payload);
    const createdAt = Date.now();
    await db.execute(
      `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [clientId, entityType, entityId, action, payloadStr, createdAt]
    );
  },

  async getUnsyncedMutations(): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const mutations: any[] = JSON.parse(localStorage.getItem('auralis_local_mutations') || '[]');
      return mutations.filter((m: any) => m.sync_status === 'pending');
    }
    return db.select("SELECT * FROM local_mutations WHERE sync_status = 'pending' ORDER BY id ASC");
  },

  async markMutationSynced(id: number) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const mutations: any[] = JSON.parse(localStorage.getItem('auralis_local_mutations') || '[]');
      const index = mutations.findIndex((m: any) => m.id === id);
      if (index !== -1) {
        mutations.splice(index, 1);
        localStorage.setItem('auralis_local_mutations', JSON.stringify(mutations));
      }
      return;
    }
    await db.execute("DELETE FROM local_mutations WHERE id = $1", [id]);
  },

  async applyRemoteMutation(mutation: any) {
    if (!db) await this.init();
    const entityType = mutation.entityType;
    const action = mutation.action;
    const entityId = mutation.entityId;
    const payload = typeof mutation.payload === 'string' ? JSON.parse(mutation.payload) : mutation.payload;

    if (entityType === 'block') {
      if (action === 'create' || action === 'update') {
        const block: KnowledgeBlock = {
          id: entityId,
          subject: payload.subject,
          title: payload.title,
          preview: payload.preview,
          time: payload.time,
          source: payload.source,
          color: payload.color,
          sync_status: 'synced',
          subjectId: payload.subjectId || payload.subject_id || undefined,
          sourceFileId: payload.sourceFileId || payload.source_file_id || undefined,
          tags: payload.tags ? (typeof payload.tags === 'string' ? JSON.parse(payload.tags) : payload.tags) : [],
          difficulty: payload.difficulty || undefined,
          mastery: payload.mastery || 0,
          reviewAt: payload.reviewAt || payload.review_at || undefined,
          relatedBlockIds: payload.relatedBlockIds ? (typeof payload.relatedBlockIds === 'string' ? JSON.parse(payload.relatedBlockIds) : payload.relatedBlockIds) : []
        };
        await this.saveBlock(block, 'synced', mutation.createdAt);
      } else if (action === 'delete') {
        await this.hardDeleteBlock(entityId);
      }
    } else if (entityType === 'task') {
      if (action === 'create' || action === 'update') {
        const task: Task = {
          id: entityId,
          name: payload.name,
          subject: payload.subject,
          desc: payload.desc || '',
          color: payload.color,
          duration: payload.duration,
          load: payload.load,
          loadText: payload.loadText,
          status: payload.status,
          startTime: payload.startTime || undefined,
          sync_status: 'synced',
          position: payload.position || '0',
          subjectId: payload.subjectId || payload.subject_id || undefined
        };
        await this.saveTask(task, 'synced', mutation.createdAt);
      } else if (action === 'delete') {
        await this.hardDeleteTask(entityId);
      }
    }
  },

  // Chat Sessions and Messages CRUD
  async createChatSession(id: string, title: string) {
    if (!db) await this.init();
    const now = Date.now();
    if (db === 'localstorage') {
      const sessions: any[] = JSON.parse(localStorage.getItem('auralis_chat_sessions') || '[]');
      sessions.push({ id, title, created_at: now, updated_at: now });
      localStorage.setItem('auralis_chat_sessions', JSON.stringify(sessions));
      return;
    }
    await db.execute(
      'INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)',
      [id, title, now, now]
    );
  },

  async appendChatMessage(id: string, sessionId: string, role: string, content: string) {
    if (!db) await this.init();
    const now = Date.now();
    if (db === 'localstorage') {
      const messages: any[] = JSON.parse(localStorage.getItem('auralis_chat_messages') || '[]');
      messages.push({ id, session_id: sessionId, role, content, created_at: now });
      localStorage.setItem('auralis_chat_messages', JSON.stringify(messages));

      // Update session's updated_at
      const sessions: any[] = JSON.parse(localStorage.getItem('auralis_chat_sessions') || '[]');
      const session = sessions.find((s: any) => s.id === sessionId);
      if (session) {
        session.updated_at = now;
        localStorage.setItem('auralis_chat_sessions', JSON.stringify(sessions));
      }
      return;
    }
    await db.execute(
      'INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, sessionId, role, content, now]
    );
    await db.execute(
      'UPDATE chat_sessions SET updated_at = $1 WHERE id = $2',
      [now, sessionId]
    );
  },

  async getChatSessions(limit = 30): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const sessions: any[] = JSON.parse(localStorage.getItem('auralis_chat_sessions') || '[]');
      sessions.sort((a: any, b: any) => b.updated_at - a.updated_at);
      return sessions.slice(0, limit);
    }
    return db.select('SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC LIMIT $1', [limit]);
  },

  async getChatMessages(sessionId: string): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const messages: any[] = JSON.parse(localStorage.getItem('auralis_chat_messages') || '[]');
      return messages.filter((m: any) => m.session_id === sessionId).sort((a: any, b: any) => a.created_at - b.created_at);
    }
    return db.select('SELECT id, session_id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);
  },

  async updateSessionTitle(id: string, title: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const sessions: any[] = JSON.parse(localStorage.getItem('auralis_chat_sessions') || '[]');
      const session = sessions.find((s: any) => s.id === id);
      if (session) {
        session.title = title;
        session.updated_at = Date.now();
        localStorage.setItem('auralis_chat_sessions', JSON.stringify(sessions));
      }
      return;
    }
    await db.execute('UPDATE chat_sessions SET title = $1, updated_at = $2 WHERE id = $3', [title, Date.now(), id]);
  },

  async deleteChatSession(id: string) {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const sessions: any[] = JSON.parse(localStorage.getItem('auralis_chat_sessions') || '[]');
      const filteredSessions = sessions.filter((s: any) => s.id !== id);
      localStorage.setItem('auralis_chat_sessions', JSON.stringify(filteredSessions));

      const messages: any[] = JSON.parse(localStorage.getItem('auralis_chat_messages') || '[]');
      const filteredMessages = messages.filter((m: any) => m.session_id !== id);
      localStorage.setItem('auralis_chat_messages', JSON.stringify(filteredMessages));
      return;
    }
    await db.execute('DELETE FROM chat_messages WHERE session_id = $1', [id]);
    await db.execute('DELETE FROM chat_sessions WHERE id = $1', [id]);
  },

  // Subject CRUD
  async getSubjects(): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      return JSON.parse(localStorage.getItem('auralis_subjects') || '[]');
    }
    return db.select('SELECT * FROM subjects ORDER BY created_at DESC');
  },

  async saveSubject(subject: any): Promise<void> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const list = JSON.parse(localStorage.getItem('auralis_subjects') || '[]');
      const idx = list.findIndex((s: any) => s.id === subject.id);
      if (idx !== -1) list[idx] = subject;
      else list.push(subject);
      localStorage.setItem('auralis_subjects', JSON.stringify(list));
      return;
    }
    const exists = await db.select('SELECT id FROM subjects WHERE id = $1', [subject.id]);
    if (exists && exists.length > 0) {
      await db.execute(
        'UPDATE subjects SET name = $1, description = $2, icon = $3, color = $4 WHERE id = $5',
        [subject.name, subject.description || '', subject.icon || '', subject.color || '', subject.id]
      );
    } else {
      await db.execute(
        'INSERT INTO subjects (id, name, description, icon, color, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [subject.id, subject.name, subject.description || '', subject.icon || '', subject.color || '', subject.created_at || Date.now()]
      );
    }
  },

  async deleteSubject(id: string): Promise<void> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const list = JSON.parse(localStorage.getItem('auralis_subjects') || '[]');
      const filtered = list.filter((s: any) => s.id !== id);
      localStorage.setItem('auralis_subjects', JSON.stringify(filtered));
      return;
    }
    // Delete files and cascade update blocks/tasks
    await db.execute('DELETE FROM source_files WHERE subject_id = $1', [id]);
    await db.execute('UPDATE knowledge_blocks SET subject_id = NULL WHERE subject_id = $1', [id]);
    await db.execute('UPDATE task_blocks SET subject_id = NULL WHERE subject_id = $1', [id]);
    await db.execute('DELETE FROM subjects WHERE id = $1', [id]);
  },

  // Source Files CRUD
  async getSourceFiles(subjectId?: string): Promise<any[]> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const list = JSON.parse(localStorage.getItem('auralis_source_files') || '[]');
      if (!subjectId) return list;
      return list.filter((f: any) => f.subject_id === subjectId);
    }
    if (!subjectId) {
      return db.select('SELECT * FROM source_files ORDER BY created_at DESC');
    }
    return db.select('SELECT * FROM source_files WHERE subject_id = $1 ORDER BY created_at DESC', [subjectId]);
  },

  async saveSourceFile(file: any): Promise<void> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const list = JSON.parse(localStorage.getItem('auralis_source_files') || '[]');
      const idx = list.findIndex((f: any) => f.id === file.id);
      if (idx !== -1) list[idx] = file;
      else list.push(file);
      localStorage.setItem('auralis_source_files', JSON.stringify(list));
      return;
    }
    const exists = await db.select('SELECT id FROM source_files WHERE id = $1', [file.id]);
    if (exists && exists.length > 0) {
      await db.execute(
        'UPDATE source_files SET name = $1, file_path = $2, file_type = $3, file_size = $4, catalog_json = $5, block_count = $6 WHERE id = $7',
        [file.name, file.file_path, file.file_type, file.file_size, file.catalog_json || null, file.block_count || 0, file.id]
      );
    } else {
      await db.execute(
        'INSERT INTO source_files (id, subject_id, name, file_path, file_type, file_size, catalog_json, block_count, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [file.id, file.subject_id, file.name, file.file_path, file.file_type, file.file_size, file.catalog_json || null, file.block_count || 0, file.created_at || Date.now()]
      );
    }
  },

  async deleteSourceFile(id: string): Promise<void> {
    if (!db) await this.init();
    if (db === 'localstorage') {
      const list = JSON.parse(localStorage.getItem('auralis_source_files') || '[]');
      const filtered = list.filter((f: any) => f.id !== id);
      localStorage.setItem('auralis_source_files', JSON.stringify(filtered));
      return;
    }
    await db.execute('DELETE FROM source_files WHERE id = $1', [id]);
  }
};
