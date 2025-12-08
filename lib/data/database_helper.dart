import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';
import 'package:bestia_scoreboard_application/data/model/game_log.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('bestia_game.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path, 
      version: 1, 
      onCreate: _createDB,
      onOpen: (db) async {
        // Sicurezza: crea la tabella log se non esiste (per aggiornamenti app)
        await db.execute('''
          CREATE TABLE IF NOT EXISTS game_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            type INTEGER NOT NULL
          )
        ''');
      }
    );
  }

  Future<void> _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        score REAL NOT NULL,
        is_active INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE game_state (
        id INTEGER PRIMARY KEY,
        dealer_index INTEGER NOT NULL,
        current_pot REAL NOT NULL,
        game_phase INTEGER NOT NULL,
        base_bet REAL DEFAULT 0.30
      )
    ''');

    await db.execute('''
      CREATE TABLE game_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type INTEGER NOT NULL
      )
    ''');
  }

  // --- SAVE & LOAD GAME STATE ---

  Future<void> saveGame(List<Player> players, int dealerIndex, double currentPot, int phase, double baseBet) async {
    final db = await database;
    final batch = db.batch();

    batch.delete('players');
    for (var p in players) {
      batch.insert('players', p.toMap());
    }

    batch.delete('game_state');
    batch.insert('game_state', {
      'id': 1,
      'dealer_index': dealerIndex,
      'current_pot': currentPot,
      'game_phase': phase,
      'base_bet': baseBet
    });

    await batch.commit(noResult: true);
  }

  Future<Map<String, dynamic>> loadGame() async {
    final db = await database;

    final playersResult = await db.query('players');
    final stateResult = await db.query('game_state', limit: 1);
    final logsResult = await db.query('game_logs', orderBy: 'timestamp DESC'); // Carichiamo i log

    int dealerIndex = 0;
    double currentPot = 0.0;
    int gamePhase = 0;
    double baseBet = 0.30;

    if (stateResult.isNotEmpty) {
      dealerIndex = stateResult.first['dealer_index'] as int;
      currentPot = (stateResult.first['current_pot'] as num).toDouble();
      gamePhase = stateResult.first['game_phase'] as int;
      if (stateResult.first['base_bet'] != null) {
        baseBet = (stateResult.first['base_bet'] as num).toDouble();
      }
    }

    return {
      'players': playersResult,
      'dealerIndex': dealerIndex,
      'currentPot': currentPot,
      'gamePhase': gamePhase,
      'baseBet': baseBet,
      'logs': logsResult, // Ritorniamo anche i log
    };
  }

  // --- LOGS MANAGEMENT ---

  Future<void> addLog(GameLog log) async {
    final db = await database;
    await db.insert('game_logs', log.toMap());
  }

  // Usato quando si fa Undo o Reset
  Future<void> clearLogs() async {
    final db = await database;
    await db.delete('game_logs');
  }

  // Sovrascrive tutti i log (per undo complessi)
  Future<void> overwriteLogs(List<GameLog> logs) async {
    final db = await database;
    final batch = db.batch();
    batch.delete('game_logs');
    for (var log in logs) {
      batch.insert('game_logs', log.toMap());
    }
    await batch.commit(noResult: true);
  }
}
