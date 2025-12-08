import 'dart:async';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
// Assicurati che questo import sia corretto per il tuo progetto
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

    return await openDatabase(
      path, 
      version: 1, 
      onCreate: _createDB
    );
  }

  Future _createDB(Database db, int version) async {
    // Tabella Giocatori
    // score è REAL per supportare decimali (es. 12.50)
    await db.execute('''
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      score REAL NOT NULL, 
      sort_order INTEGER NOT NULL 
    )
    ''');

    // Tabella Settings (Chiave-Valore)
    // value è REAL per supportare sia interi (dealerIndex) che double (currentPot, baseBet)
    await db.execute('''
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value REAL NOT NULL
    )
    ''');
  }

  // SALVATAGGIO STATO COMPLETO
  Future<void> saveGame(
    List<Player> players, 
    int dealerIndex, 
    double currentPot, 
    int phaseIndex,
    double baseBet // NUOVO PARAMETRO
  ) async {
    final db = await instance.database;
    
    // Transazione per garantire atomicità
    await db.transaction((txn) async {
      // 1. Pulizia
      await txn.delete('players');
      await txn.delete('settings');

      // 2. Salvataggio Giocatori
      for (int i = 0; i < players.length; i++) {
        await txn.insert('players', players[i].toMap(i));
      }

      // 3. Salvataggio Settings
      await txn.insert('settings', {'key': 'dealer_index', 'value': dealerIndex});
      await txn.insert('settings', {'key': 'current_pot', 'value': currentPot});
      await txn.insert('settings', {'key': 'game_phase', 'value': phaseIndex});
      await txn.insert('settings', {'key': 'baseBet', 'value': baseBet}); // Salviamo la messa base
    });
  }

  // CARICAMENTO STATO COMPLETO
  Future<Map<String, dynamic>> loadGame() async {
    final db = await instance.database;
    
    // Leggi Giocatori
    final playersData = await db.query('players', orderBy: 'sort_order ASC');
    
    // Leggi Settings
    final settingsData = await db.query('settings');

    // Converti la lista di settings in una Mappa per accesso facile
    Map<String, double> settingsMap = {};
    for (var row in settingsData) {
      // sqflite può ritornare int o double in base al contenuto, forziamo double
      settingsMap[row['key'] as String] = (row['value'] as num).toDouble();
    }

    return {
      'players': playersData,
      'dealerIndex': settingsMap['dealer_index']?.toInt() ?? 0,
      'currentPot': settingsMap['current_pot'] ?? 0.0,
      'gamePhase': settingsMap['game_phase']?.toInt() ?? 0,
      // Se non esiste (vecchio DB o prima installazione), il provider userà il default (0.30)
      // ma se esiste lo passiamo.
      'baseBet': settingsMap['baseBet'] ?? 0.30, 
    };
  }
}
