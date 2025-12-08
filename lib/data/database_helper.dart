import 'dart:async';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('poker_game.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(path, version: 1, onCreate: _createDB);
  }

  Future _createDB(Database db, int version) async {
    await db.execute('''
    CREATE TABLE players (
      id TEXT PRIMARY KEY, name TEXT, score INTEGER, sort_order INTEGER
    )
    ''');
    
    // Settings conterrà: dealer_index, current_pot, game_phase
    await db.execute('CREATE TABLE settings (key TEXT PRIMARY KEY, value INTEGER)');
  }

  Future<void> saveGame(List<Player> players, int dealerIndex, int currentPot, int phaseIndex) async {
    final db = await instance.database;
    await db.transaction((txn) async {
      await txn.delete('players');
      await txn.delete('settings');

      for (int i = 0; i < players.length; i++) {
        await txn.insert('players', players[i].toMap(i));
      }

      await txn.insert('settings', {'key': 'dealer_index', 'value': dealerIndex});
      await txn.insert('settings', {'key': 'current_pot', 'value': currentPot});
      await txn.insert('settings', {'key': 'game_phase', 'value': phaseIndex});
    });
  }

  Future<Map<String, dynamic>> loadGame() async {
    final db = await instance.database;
    final playersData = await db.query('players', orderBy: 'sort_order ASC');
    final settingsData = await db.query('settings');

    // Mappa di appoggio per leggere i settings facilmente
    Map<String, int> settingsMap = {};
    for (var row in settingsData) {
      settingsMap[row['key'] as String] = row['value'] as int;
    }

    return {
      'players': playersData,
      'dealerIndex': settingsMap['dealer_index'] ?? 0,
      'currentPot': settingsMap['current_pot'] ?? 0, // Default piatto 0
      'gamePhase': settingsMap['game_phase'] ?? 0,   // Default fase 0
    };
  }
}
