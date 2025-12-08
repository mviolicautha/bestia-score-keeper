import 'package:flutter/material.dart';
import 'package:bestia_scoreboard_application/data/database_helper.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class GameProvider extends ChangeNotifier {
  List<Player> players = [];
  int dealerIndex = 0;
  double currentPot = 0.0;
  GamePhase currentPhase = GamePhase.dealerSelection;
  
  // Messa iniziale (default 0.30 per facilitare diviso 3)
  double baseBet = 0.30; 

  Set<String> selectedPlayerIds = {};
  bool isLoading = true;

  GameProvider() {
    _loadData();
  }

  Future<void> _loadData() async {
    final data = await DatabaseHelper.instance.loadGame();
    
    final playerList = data['players'] as List<Map<String, dynamic>>;
    players = playerList.map((m) => Player(
      id: m['id'], 
      name: m['name'], 
      score: (m['score'] as num).toDouble(), // Già corretto
    )).toList();

    dealerIndex = data['dealerIndex'] as int;
    
    // --- CORREZIONE QUI SOTTO ---
    // Invece di 'as double', usa '(nome_valore as num).toDouble()'
    currentPot = (data['currentPot'] as num).toDouble(); 
    
    // Stessa cosa per baseBet se presente
    if (data.containsKey('baseBet')) {
        baseBet = (data['baseBet'] as num).toDouble();
    }
    // ----------------------------

    int phaseIndex = data['gamePhase'] as int;
    currentPhase = (phaseIndex >= 0 && phaseIndex < GamePhase.values.length) 
        ? GamePhase.values[phaseIndex] 
        : GamePhase.dealerSelection;

    isLoading = false;
    notifyListeners();
  }
  void _autoSave() {
    // Salviamo anche la baseBet
    DatabaseHelper.instance.saveGame(
      players, 
      dealerIndex, 
      currentPot, 
      currentPhase.index,
      baseBet // Assicurati di aggiornare DatabaseHelper per accettare questo parametro
    );
    notifyListeners();
  }

  // IMPOSTA LA MESSA
  void setBaseBet(double newBet) {
    // Validazione tollerante per float: deve essere multiplo di 0.30
    double remainder = newBet % 0.30;
    // Se resto è ~0 o ~0.30
    if (remainder < 0.001 || (0.30 - remainder) < 0.001) {
      baseBet = newBet;
      _autoSave();
      notifyListeners();
    } else {
      debugPrint("Messa non valida: $newBet");
    }
  }

  void addPlayer(String name) {
    if (players.length < 10) {
      players.add(Player(name: name));
      _autoSave();
    }
  }

  void togglePlayerSelection(String playerId) {
    if (currentPhase == GamePhase.dealerSelection) return; 

    if (selectedPlayerIds.contains(playerId)) {
      selectedPlayerIds.remove(playerId);
    } else {
      if (currentPhase == GamePhase.pickingWinners && selectedPlayerIds.length >= 3) {
        return; 
      }
      selectedPlayerIds.add(playerId);
    }
    notifyListeners();
  }

  // FASE 1 -> FASE 1 (Passa Mazzo)
  void passHandWithoutPlaying() {
    if (players.isEmpty) return;
    dealerIndex = (dealerIndex + 1) % players.length;
    
    // Il nuovo dealer mette la baseBet
    Player newDealer = players[dealerIndex];
    newDealer.score -= baseBet;
    currentPot += baseBet;
    
    _autoSave();
  }

  // FASE 1 -> FASE 2
  void startHand() {
    currentPhase = GamePhase.pickingWinners;
    selectedPlayerIds.clear();
    _autoSave();
  }

  // FASE 2 -> FASE 3
  void confirmWinners() {
    if (selectedPlayerIds.isEmpty) return;

    int numWinners = selectedPlayerIds.length;
    
    // Divisione Reale
    double splitAmount = currentPot / numWinners; 
    
    for (String id in selectedPlayerIds) {
      final player = players.firstWhere((p) => p.id == id);
      player.score += splitAmount;
    }
    
    currentPhase = GamePhase.pickingLosers;
    selectedPlayerIds.clear(); 
    _autoSave();
  }

  // FASE 3 -> FASE 1
  void confirmLosersAndEndHand() {
    double penaltyAmount = currentPot; // La penalità è il piatto intero (che ora è stato distribuito ma il valore numerico in currentPot è il riferimento)
    double totalPenaltiesCollected = 0.0;

    // Perdenti pagano
    for (String id in selectedPlayerIds) {
      final player = players.firstWhere((p) => p.id == id);
      player.score -= penaltyAmount;
      totalPenaltiesCollected += penaltyAmount;
    }

    if (players.isNotEmpty) {
      dealerIndex = (dealerIndex + 1) % players.length;
      
      // Nuovo Dealer mette invito
      Player newDealer = players[dealerIndex];
      newDealer.score -= baseBet;
      
      currentPot = totalPenaltiesCollected + baseBet; 
    } else {
      currentPot = 0.0;
    }

    currentPhase = GamePhase.dealerSelection;
    selectedPlayerIds.clear();
    _autoSave();
  }

  // END GAME
  List<Player> endGame() {
    // Restituzione invito se il piatto contiene SOLO la messa base
    if ((currentPot - baseBet).abs() < 0.01 && players.isNotEmpty) {
      final dealer = players[dealerIndex];
      dealer.score += baseBet;
      currentPot = 0.0;
    }

    // Check somma zero (debug)
    double totalScore = players.fold(0.0, (sum, p) => sum + p.score);
    if (totalScore.abs() > 0.01) {
      debugPrint("ERRORE CONTABILE: Somma non zero ($totalScore)");
    }

    List<Player> rankedPlayers = List.from(players);
    rankedPlayers.sort((a, b) => b.score.compareTo(a.score));

    players = [];
    dealerIndex = 0;
    currentPot = 0.0;
    currentPhase = GamePhase.dealerSelection;
    selectedPlayerIds.clear();
    _autoSave(); 

    return rankedPlayers;
  }
}
