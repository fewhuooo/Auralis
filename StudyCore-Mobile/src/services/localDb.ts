import type { KnowledgeBlock } from '@/store/useBlockStore';
import type { Task } from '@/store/useTaskStore';

const DB_NAME = 'studycore';
const DB_PATH = '_doc/studycore.db';

declare const plus: any;

// Helper to wrap plus.sqlite in Promises
const sqlite = {
  isOpen(): boolean {
    if (typeof plus === 'undefined' || !plus.sqlite) return false;
    return plus.sqlite.isOpenDatabase({ name: DB_NAME, path: DB_PATH });
  },

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof plus === 'undefined' || !plus.sqlite) {
        return reject(new Error('HTML5+ SQLite environment is not available. Please run in App environment.'));
      }
      if (this.isOpen()) {
        return resolve();
      }
      plus.sqlite.openDatabase({
        name: DB_NAME,
        path: DB_PATH,
        success: () => resolve(),
        fail: (e: any) => reject(new Error('Failed to open database: ' + JSON.stringify(e)))
      });
    });
  },

  execute(sql: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.open();
        plus.sqlite.executeSql({
          name: DB_NAME,
          sql: sql,
          success: () => resolve(),
          fail: (e: any) => reject(new Error(`Failed to execute SQL: ${sql}. Error: ${JSON.stringify(e)}`))
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  select(sql: string): Promise<any[]> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.open();
        plus.sqlite.selectSql({
          name: DB_NAME,
          sql: sql,
          success: (data: any) => resolve(data || []),
          fail: (e: any) => reject(new Error(`Failed to select SQL: ${sql}. Error: ${JSON.stringify(e)}`))
        });
      } catch (err) {
        reject(err);
      }
    });
  }
};

export const localDb = {
  async init() {
    try {
      await sqlite.open();
      await this.createTables();
      await this.runMigrations();
      console.log('[SQLite Mobile] Native database and tables initialized.');
    } catch (e) {
      console.error('[SQLite Mobile] Database initialization failed:', e);
      throw e;
    }
  },

  async createTables() {
    await sqlite.execute(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
    await sqlite.execute(`
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
    await sqlite.execute(`
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
    await sqlite.execute(`
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
    await sqlite.execute(`
      CREATE TABLE IF NOT EXISTS subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT,
        created_at INTEGER
      )
    `);
    await sqlite.execute(`
      CREATE TABLE IF NOT EXISTS source_files (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        name TEXT NOT NULL,
        file_path TEXT,
        file_type TEXT,
        file_size INTEGER,
        catalog_json TEXT,
        block_count INTEGER DEFAULT 0,
        created_at INTEGER
      )
    `);
  },

  async runMigrations() {
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN sync_version INTEGER DEFAULT 0");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await sqlite.execute("ALTER TABLE task_blocks ADD COLUMN sync_version INTEGER DEFAULT 0");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await sqlite.execute("ALTER TABLE task_blocks ADD COLUMN position TEXT DEFAULT '0'");
    } catch (e) {
      // Safe to ignore if already exists
    }
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN subject_id TEXT");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN source_file_id TEXT");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN tags TEXT");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN difficulty TEXT");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN mastery INTEGER DEFAULT 0");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN review_at TEXT");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE knowledge_blocks ADD COLUMN related_block_ids TEXT");
    } catch (e) {}
    try {
      await sqlite.execute("ALTER TABLE task_blocks ADD COLUMN subject_id TEXT");
    } catch (e) {}
  },

  // Sync Metadata Key-Value helpers
  async getMetadata(key: string): Promise<string | null> {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const rows = await sqlite.select(`SELECT value FROM sync_metadata WHERE key = '${esc(key)}'`);
    if (rows && rows.length > 0) {
      return rows[0].value;
    }
    return null;
  },

  async setMetadata(key: string, value: string) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT key FROM sync_metadata WHERE key = '${esc(key)}'`);
    if (exists && exists.length > 0) {
      await sqlite.execute(`UPDATE sync_metadata SET value = '${esc(value)}' WHERE key = '${esc(key)}'`);
    } else {
      await sqlite.execute(`INSERT INTO sync_metadata (key, value) VALUES ('${esc(key)}', '${esc(value)}')`);
    }
  },

  // Knowledge Blocks
  async getBlocks(subject?: string, subjectId?: string): Promise<KnowledgeBlock[]> {
    let query = 'SELECT * FROM knowledge_blocks WHERE is_deleted = 0';
    if (subjectId) {
      query += ` AND subject_id = '${subjectId.replace(/'/g, "''")}'`;
    } else if (subject) {
      query += ` AND subject = '${subject.replace(/'/g, "''")}'`;
    }
    query += ' ORDER BY time DESC';
    const records = await sqlite.select(query);
    return records.map((r: any) => ({
      id: r.id,
      subject: r.subject,
      title: r.title,
      preview: r.preview,
      time: r.time,
      source: r.source,
      color: r.color,
      sync_status: r.sync_status,
      sync_version: r.sync_version || 0,
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
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT id FROM knowledge_blocks WHERE id = '${esc(block.id)}'`);
    const isDeletedVal = block.is_deleted ? 1 : 0;
    const versionVal = block.sync_version || syncVersion || 0;

    const subjectIdVal = block.subjectId || '';
    const sourceFileIdVal = block.sourceFileId || '';
    const tagsVal = block.tags ? JSON.stringify(block.tags) : '[]';
    const difficultyVal = block.difficulty || '';
    const masteryVal = block.mastery || 0;
    const reviewAtVal = block.reviewAt || '';
    const relatedBlockIdsVal = block.relatedBlockIds ? JSON.stringify(block.relatedBlockIds) : '[]';

    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE knowledge_blocks SET
          subject = '${esc(block.subject)}',
          title = '${esc(block.title)}',
          preview = '${esc(block.preview)}',
          time = '${esc(block.time)}',
          source = '${esc(block.source)}',
          color = '${esc(block.color)}',
          sync_status = '${syncStatus}',
          is_deleted = ${isDeletedVal},
          sync_version = ${versionVal},
          subject_id = '${esc(subjectIdVal)}',
          source_file_id = '${esc(sourceFileIdVal)}',
          tags = '${esc(tagsVal)}',
          difficulty = '${esc(difficultyVal)}',
          mastery = ${masteryVal},
          review_at = '${esc(reviewAtVal)}',
          related_block_ids = '${esc(relatedBlockIdsVal)}'
        WHERE id = '${esc(block.id)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO knowledge_blocks (id, subject, title, preview, time, source, color, sync_status, is_deleted, sync_version, subject_id, source_file_id, tags, difficulty, mastery, review_at, related_block_ids)
        VALUES (
          '${esc(block.id)}',
          '${esc(block.subject)}',
          '${esc(block.title)}',
          '${esc(block.preview)}',
          '${esc(block.time)}',
          '${esc(block.source)}',
          '${esc(block.color)}',
          '${syncStatus}',
          ${isDeletedVal},
          ${versionVal},
          '${esc(subjectIdVal)}',
          '${esc(sourceFileIdVal)}',
          '${esc(tagsVal)}',
          '${esc(difficultyVal)}',
          ${masteryVal},
          '${esc(reviewAtVal)}',
          '${esc(relatedBlockIdsVal)}'
        )
      `);
    }
  },

  async deleteBlock(id: string) {
    const record = await sqlite.select(`SELECT sync_status FROM knowledge_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    if (record && record[0] && record[0].sync_status === 'pending_create') {
      await sqlite.execute(`DELETE FROM knowledge_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    } else {
      await sqlite.execute(`UPDATE knowledge_blocks SET is_deleted = 1, sync_status = 'pending_delete' WHERE id = '${id.replace(/'/g, "''")}'`);
    }
  },

  async hardDeleteBlock(id: string) {
    await sqlite.execute(`DELETE FROM knowledge_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async getUnsyncedBlocks(): Promise<any[]> {
    return sqlite.select("SELECT * FROM knowledge_blocks WHERE sync_status != 'synced'");
  },

  async markBlockSynced(id: string) {
    await sqlite.execute(`UPDATE knowledge_blocks SET sync_status = 'synced' WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async mergeBlocksFromServer(serverBlocks: KnowledgeBlock[]) {
    await this.batchMergeBlocks(serverBlocks);
  },

  async batchMergeBlocks(serverBlocks: any[]) {
    for (const block of serverBlocks) {
      if (!block.id) continue;
      const escId = block.id.replace(/'/g, "''");
      const local = await sqlite.select(`SELECT sync_status, sync_version FROM knowledge_blocks WHERE id = '${escId}'`);
      
      if (block.isDeleted || block.is_deleted) {
        if (local && local.length > 0) {
          if (local[0].sync_status !== 'synced') {
            const serverVer = block.syncVersion || block.sync_version || 0;
            const localVer = local[0].sync_version || 0;
            if (serverVer < localVer) {
              continue; // Keep local modifications
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
            continue; // Keep local modifications
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

  // Task Blocks
  async getTasks(): Promise<Task[]> {
    const records = await sqlite.select('SELECT * FROM task_blocks WHERE is_deleted = 0 ORDER BY position ASC');
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
      sync_version: r.sync_version || 0,
      is_deleted: r.is_deleted === 1,
      position: r.position || '0',
      subjectId: r.subject_id || undefined
    }));
  },

  async saveTask(task: Task, syncStatus = 'synced', syncVersion = 0) {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT id FROM task_blocks WHERE id = '${esc(task.id)}'`);
    const isDeletedVal = task.is_deleted ? 1 : 0;
    const versionVal = task.sync_version || syncVersion || 0;
    const positionVal = task.position || '0';
    const subjectIdVal = task.subjectId || '';
    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE task_blocks SET
          name = '${esc(task.name)}',
          subject = '${esc(task.subject)}',
          desc = '${esc(task.desc || '')}',
          color = '${esc(task.color)}',
          duration = ${task.duration},
          load = '${esc(task.load)}',
          loadText = '${esc(task.loadText)}',
          status = '${esc(task.status)}',
          startTime = ${task.startTime ? `'${esc(task.startTime)}'` : 'NULL'},
          sync_status = '${syncStatus}',
          is_deleted = ${isDeletedVal},
          sync_version = ${versionVal},
          position = '${esc(positionVal)}',
          subject_id = '${esc(subjectIdVal)}'
        WHERE id = '${esc(task.id)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO task_blocks (id, name, subject, desc, color, duration, load, loadText, status, startTime, sync_status, is_deleted, sync_version, position, subject_id)
        VALUES (
          '${esc(task.id)}',
          '${esc(task.name)}',
          '${esc(task.subject)}',
          '${esc(task.desc || '')}',
          '${esc(task.color)}',
          ${task.duration},
          '${esc(task.load)}',
          '${esc(task.loadText)}',
          '${esc(task.status)}',
          ${task.startTime ? `'${esc(task.startTime)}'` : 'NULL'},
          '${syncStatus}',
          ${isDeletedVal},
          ${versionVal},
          '${esc(positionVal)}',
          '${esc(subjectIdVal)}'
        )
      `);
    }
  },

  async deleteTask(id: string) {
    const record = await sqlite.select(`SELECT sync_status FROM task_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    if (record && record[0] && record[0].sync_status === 'pending_create') {
      await sqlite.execute(`DELETE FROM task_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
    } else {
      await sqlite.execute(`UPDATE task_blocks SET is_deleted = 1, sync_status = 'pending_delete' WHERE id = '${id.replace(/'/g, "''")}'`);
    }
  },

  async hardDeleteTask(id: string) {
    await sqlite.execute(`DELETE FROM task_blocks WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async getUnsyncedTasks(): Promise<any[]> {
    return sqlite.select("SELECT * FROM task_blocks WHERE sync_status != 'synced'");
  },

  async markTaskSynced(id: string) {
    await sqlite.execute(`UPDATE task_blocks SET sync_status = 'synced' WHERE id = '${id.replace(/'/g, "''")}'`);
  },

  async mergeTasksFromServer(serverTasks: Task[]) {
    await this.batchMergeTasks(serverTasks);
  },

  async batchMergeTasks(serverTasks: any[]) {
    for (const task of serverTasks) {
      if (!task.id) continue;
      const escId = task.id.replace(/'/g, "''");
      const local = await sqlite.select(`SELECT sync_status, sync_version FROM task_blocks WHERE id = '${escId}'`);
      
      if (task.isDeleted || task.is_deleted) {
        if (local && local.length > 0) {
          if (local[0].sync_status !== 'synced') {
            const serverVer = task.syncVersion || task.sync_version || 0;
            const localVer = local[0].sync_version || 0;
            if (serverVer < localVer) {
              continue; // Keep local modifications
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
            continue; // Keep local modifications
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
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const payloadStr = JSON.stringify(payload);
    const createdAt = Date.now();
    await sqlite.execute(
      `INSERT INTO local_mutations (client_id, entity_type, entity_id, action, payload, created_at, sync_status)
       VALUES ('${esc(clientId)}', '${esc(entityType)}', '${esc(entityId)}', '${esc(action)}', '${esc(payloadStr)}', ${createdAt}, 'pending')`
    );
  },

  async getUnsyncedMutations(): Promise<any[]> {
    return sqlite.select("SELECT * FROM local_mutations WHERE sync_status = 'pending' ORDER BY id ASC");
  },

  async markMutationSynced(id: number) {
    await sqlite.execute(`DELETE FROM local_mutations WHERE id = ${id}`);
  },

  async applyRemoteMutation(mutation: any) {
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

  // Subject CRUD
  async getSubjects(): Promise<any[]> {
    return sqlite.select('SELECT * FROM subjects ORDER BY created_at DESC');
  },

  async saveSubject(subject: any): Promise<void> {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT id FROM subjects WHERE id = '${esc(subject.id)}'`);
    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE subjects SET 
          name = '${esc(subject.name)}', 
          description = '${esc(subject.description || '')}', 
          icon = '${esc(subject.icon || '')}', 
          color = '${esc(subject.color || '')}' 
        WHERE id = '${esc(subject.id)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO subjects (id, name, description, icon, color, created_at) 
        VALUES (
          '${esc(subject.id)}', 
          '${esc(subject.name)}', 
          '${esc(subject.description || '')}', 
          '${esc(subject.icon || '')}', 
          '${esc(subject.color || '')}', 
          ${subject.created_at || Date.now()}
        )
      `);
    }
  },

  async deleteSubject(id: string): Promise<void> {
    const escId = id.replace(/'/g, "''");
    await sqlite.execute(`DELETE FROM source_files WHERE subject_id = '${escId}'`);
    await sqlite.execute(`UPDATE knowledge_blocks SET subject_id = NULL WHERE subject_id = '${escId}'`);
    await sqlite.execute(`UPDATE task_blocks SET subject_id = NULL WHERE subject_id = '${escId}'`);
    await sqlite.execute(`DELETE FROM subjects WHERE id = '${escId}'`);
  },

  // Source Files CRUD
  async getSourceFiles(subjectId: string): Promise<any[]> {
    const escId = subjectId.replace(/'/g, "''");
    return sqlite.select(`SELECT * FROM source_files WHERE subject_id = '${escId}' ORDER BY created_at DESC`);
  },

  async saveSourceFile(file: any): Promise<void> {
    const esc = (val: string) => (val || '').replace(/'/g, "''");
    const exists = await sqlite.select(`SELECT id FROM source_files WHERE id = '${esc(file.id)}'`);
    const catalogJsonVal = file.catalog_json || '';
    const blockCountVal = file.block_count || 0;
    if (exists && exists.length > 0) {
      await sqlite.execute(`
        UPDATE source_files SET 
          name = '${esc(file.name)}', 
          file_path = '${esc(file.file_path)}', 
          file_type = '${esc(file.file_type)}', 
          file_size = ${file.file_size}, 
          catalog_json = '${esc(catalogJsonVal)}', 
          block_count = ${blockCountVal} 
        WHERE id = '${esc(file.id)}'
      `);
    } else {
      await sqlite.execute(`
        INSERT INTO source_files (id, subject_id, name, file_path, file_type, file_size, catalog_json, block_count, created_at) 
        VALUES (
          '${esc(file.id)}', 
          '${esc(file.subject_id)}', 
          '${esc(file.name)}', 
          '${esc(file.file_path)}', 
          '${esc(file.file_type)}', 
          ${file.file_size}, 
          '${esc(catalogJsonVal)}', 
          ${blockCountVal}, 
          ${file.created_at || Date.now()}
        )
      `);
    }
  },

  async deleteSourceFile(id: string): Promise<void> {
    const escId = id.replace(/'/g, "''");
    await sqlite.execute(`DELETE FROM source_files WHERE id = '${escId}'`);
  }
};
