import 'package:flutter/material.dart';
import 'package:bestia_scoreboard_application/data/database_helper.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

// Classe per memorizzare uno stato passato (Snapshot)
class GameSnapshot {
  final List<Player> players;
  final int dealerIndex;
  final double currentPot;
  final GamePhase currentPhase;
  final double baseBet;
  final List<Set<String>> selectionGroups;
  final bool isLinkingMode;
  final Set<String> currentHandWinners; 

  GameSnapshot({
    required this.players,
    required this.dealerIndex,
    required this.currentPot,
    required this.currentPhase,
    required this.baseBet,
    required this.selectionGroups,
    required this.isLinkingMode,
    required this.currentHandWinners,
  });
}

class GameProvider extends ChangeNotifier {
  List<Player> players = [];
  int dealerIndex = 0;
  double currentPot = 0.0;
  GamePhase currentPhase = GamePhase.dealerSelection;
  double baseBet = 0.30; 

  // Gestione Gruppi/Società
  List<Set<String>> selectionGroups = [];
  bool isLinkingMode = false;

  // Memoria temporanea dei vincitori per validazione logica
  Set<String> currentHandWinners = {};

  // STORICO UNDO (Max 5 stati)
  final List<GameSnapshot> _history = [];

  bool isLoading = true;

  GameProvider() {
    _loadData();
  }
  
  // Getter utili
  List<Player> get activePlayers => players.where((p) => p.isActive).toList();
  bool get canUndo => _history.isNotEmpty;

  // Posso cambiare impostazioni/giocatori solo se il piatto è "pulito"
  // (cioè contiene 0 o ESATTAMENTE la baseBet corrente)
  bool get canChangeBet {
    if (currentPot < 0.01) return true; 
    if ((currentPot - baseBet).abs() < 0.01) return true;
    return false;
  }

  Future<void> _loadData() async {
    final data = await DatabaseHelper.instance.loadGame();
    
    final playerList = data['players'] as List<Map<String, dynamic>>;
    players = playerList.map((m) => Player(
      id: m['id'], 
      name: m['name'], 
      score: (m['score'] as num).toDouble(),
      isActive: (m['is_active'] as int) == 1,
    )).toList();

    dealerIndex = data['dealerIndex'] as int;
    currentPot = (data['currentPot'] as num).toDouble();
    if (data.containsKey('baseBet')) {
        baseBet = (data['baseBet'] as num).toDouble();
    }
    
    int phaseIndex = data['gamePhase'] as int;
    currentPhase = (phaseIndex >= 0 && phaseIndex < GamePhase.values.length) 
        ? GamePhase.values[phaseIndex] 
        : GamePhase.dealerSelection;

    isLoading = false;
    notifyListeners();
  }

  void _autoSave() {
    DatabaseHelper.instance.saveGame(
      players, dealerIndex, currentPot, currentPhase.index, baseBet
    );
    notifyListeners();
  }

  // --- LOGICA UNDO ---

  void _saveSnapshot() {
    // Deep Copy
    final playersCopy = players.map((p) => p.copy()).toList();
    final groupsCopy = selectionGroups.map((set) => Set<String>.from(set)).toList();
    final winnersCopy = Set<String>.from(currentHandWinners);

    final snapshot = GameSnapshot(
      players: playersCopy,
      dealerIndex: dealerIndex,
      currentPot: currentPot,
      currentPhase: currentPhase,
      baseBet: baseBet,
      selectionGroups: groupsCopy,
      isLinkingMode: isLinkingMode,
      currentHandWinners: winnersCopy,
    );

    _history.add(snapshot);

    // Limite storico a 5
    if (_history.length > 5) {
      _history.removeAt(0); 
    }
  }

  void undoLastAction() {
    if (_history.isEmpty) return;

    final snapshot = _history.removeLast();

    // Ripristino Deep Copy
    players = snapshot.players.map((p) => p.copy()).toList();
    dealerIndex = snapshot.dealerIndex;
    currentPot = snapshot.currentPot;
    currentPhase = snapshot.currentPhase;
    baseBet = snapshot.baseBet;
    selectionGroups = snapshot.selectionGroups.map((set) => Set<String>.from(set)).toList();
    isLinkingMode = snapshot.isLinkingMode;
    currentHandWinners = Set<String>.from(snapshot.currentHandWinners);

    _autoSave();
    notifyListeners();
  }

  // --- IMPOSTAZIONI ---

  void setBaseBet(double newBet) {
    double remainder = newBet % 0.30;
    if (remainder < 0.001 || (0.30 - remainder) < 0.001) {
      _saveSnapshot();
      
      // Se piatto pulito, aggiorniamo anche il piatto e il dealer corrente
      if ((currentPot - baseBet).abs() < 0.01 && players.isNotEmpty) {
         double difference = newBet - baseBet;
         if (dealerIndex < players.length) {
            players[dealerIndex].score -= difference;
         }
         currentPot = newBet;
      }

      baseBet = newBet;
      _autoSave();
      notifyListeners();
    }
  }

  // --- GESTIONE GIOCATORI ---

  bool addPlayer(String name) {
    if (!canChangeBet) return false;

    if (players.length < 15) { 
      _saveSnapshot();
      
      final newPlayer = Player(name: name);
      players.add(newPlayer);

      // CORREZIONE: Il primo giocatore paga subito l'invito
      if (players.length == 1) {
        dealerIndex = 0; 
        newPlayer.score -= baseBet; 
        currentPot = baseBet; 
      }

      _autoSave();
      notifyListeners();
      return true;
    }
    return false;
  }
  
  void playerLeavesTable(String playerId) {
    if (!canChangeBet) return;

    _saveSnapshot();

    final index = players.indexWhere((p) => p.id == playerId);
    if (index != -1) {
      players[index].isActive = false;
      if (dealerIndex == index) {
        passDealerTokenToNextActive();
      }
      _autoSave();
      notifyListeners();
    }
  }

  void passDealerTokenToNextActive() {
     if (activePlayers.isEmpty) return;
     int nextIndex = dealerIndex;
     do {
       nextIndex = (nextIndex + 1) % players.length;
     } while (!players[nextIndex].isActive && nextIndex != dealerIndex);
     dealerIndex = nextIndex;
  }

  // --- SELEZIONE (SOCIETÀ) ---

  void toggleLinkingMode() {
    isLinkingMode = !isLinkingMode;
    notifyListeners();
  }

  // Ritorna false se l'azione è bloccata (es. seleziono vincitore come perdente)
  bool togglePlayerSelection(String playerId) {
    if (currentPhase == GamePhase.dealerSelection) return false;

    // VALIDAZIONE LOGICA
    if (currentPhase == GamePhase.pickingLosers) {
      if (currentHandWinners.contains(playerId)) {
        return false; // BLOCCATO: Ha vinto questa mano
      }
    }

    int existingGroupIndex = -1;
    for (int i = 0; i < selectionGroups.length; i++) {
      if (selectionGroups[i].contains(playerId)) {
        existingGroupIndex = i;
        break;
      }
    }

    if (existingGroupIndex != -1) {
      var group = selectionGroups[existingGroupIndex];
      group.remove(playerId);
      if (group.isEmpty) {
        selectionGroups.removeAt(existingGroupIndex);
      } 
      notifyListeners();
      return true;
    }

    if (isLinkingMode) {
      if (selectionGroups.isNotEmpty) {
        selectionGroups.last.add(playerId);
      } else {
        selectionGroups.add({playerId});
      }
    } else {
      if (currentPhase == GamePhase.pickingWinners && selectionGroups.length >= 3) {
        return false; 
      }
      selectionGroups.add({playerId});
    }
    
    notifyListeners();
    return true;
  }

  int getPlayerGroupIndex(String playerId) {
    for (int i = 0; i < selectionGroups.length; i++) {
      if (selectionGroups[i].contains(playerId)) return i;
    }
    return -1;
  }

  // --- FLUSSO DI GIOCO ---

  void passHandWithoutPlaying() {
    if (activePlayers.isEmpty) return;
    
    _saveSnapshot();

    passDealerTokenToNextActive();
    players[dealerIndex].score -= baseBet;
    currentPot += baseBet;
    
    _autoSave();
  }

  void startHand() {
    _saveSnapshot();
    currentPhase = GamePhase.pickingWinners;
    selectionGroups.clear();
    currentHandWinners.clear();
    isLinkingMode = false;
    _autoSave();
  }

  void confirmWinners() {
    if (selectionGroups.isEmpty) return;

    _saveSnapshot();

    int numberOfEntities = selectionGroups.length;
    double amountPerEntity = currentPot / numberOfEntities;
    
    currentHandWinners.clear();

    for (var group in selectionGroups) {
      currentHandWinners.addAll(group); // Memorizza chi ha vinto

      int membersCount = group.length;
      double amountPerPlayer = amountPerEntity / membersCount;

      for (String id in group) {
        final player = players.firstWhere((p) => p.id == id);
        player.score += amountPerPlayer;
      }
    }

    currentPhase = GamePhase.pickingLosers;
    selectionGroups.clear();
    isLinkingMode = false;
    _autoSave();
  }

  void confirmLosersAndEndHand() {
    _saveSnapshot();

    double totalDebtToPay = currentPot; 
    double collected = 0.0;

    for (var group in selectionGroups) {
      int membersCount = group.length;
      double penaltyPerPlayer = totalDebtToPay / membersCount;

      for (String id in group) {
        final player = players.firstWhere((p) => p.id == id);
        player.score -= penaltyPerPlayer;
        collected += penaltyPerPlayer;
      }
    }
    
    currentHandWinners.clear(); // Reset memoria vincitori

    if (activePlayers.isNotEmpty) {
      passDealerTokenToNextActive();
      players[dealerIndex].score -= baseBet;
      currentPot = collected + baseBet; 
    } else {
      currentPot = 0.0;
    }

    currentPhase = GamePhase.dealerSelection;
    selectionGroups.clear();
    isLinkingMode = false;
    _autoSave();
  }

  List<Player> endGame() {
    if ((currentPot - baseBet).abs() < 0.01 && players.isNotEmpty) {
      players[dealerIndex].score += baseBet;
      currentPot = 0.0;
    }

    List<Player> rankedPlayers = List.from(players);
    rankedPlayers.sort((a, b) => b.score.compareTo(a.score));

    players = [];
    dealerIndex = 0;
    currentPot = 0.0;
    currentPhase = GamePhase.dealerSelection;
    selectionGroups.clear();
    currentHandWinners.clear();
    _history.clear(); 
    _autoSave(); 

    return rankedPlayers;
  }
}
