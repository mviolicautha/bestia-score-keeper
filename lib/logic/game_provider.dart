import 'package:flutter/material.dart';
import 'package:bestia_scoreboard_application/data/database_helper.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class GameProvider extends ChangeNotifier {
  List<Player> players = [];
  int dealerIndex = 0;
  double currentPot = 0.0;
  GamePhase currentPhase = GamePhase.dealerSelection;
  double baseBet = 0.30; 

  // Gruppi di selezione (Lista di Set di ID) per gestire società
  List<Set<String>> selectionGroups = [];
  bool isLinkingMode = false;

  bool isLoading = true;

  GameProvider() {
    _loadData();
  }
  
  // Getter: Ritorna solo i giocatori che sono seduti al tavolo
  List<Player> get activePlayers => players.where((p) => p.isActive).toList();

  // Getter: Posso cambiare la messa o aggiungere/rimuovere giocatori?
  // Solo se il piatto è vuoto (0) o contiene SOLO l'invito base corrente
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
      isActive: (m['is_active'] as int) == 1, // Mappa 0/1 a bool
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

  // --- IMPOSTAZIONI ---

  void setBaseBet(double newBet) {
    double remainder = newBet % 0.30;
    if (remainder < 0.001 || (0.30 - remainder) < 0.001) {
      
      // Se il piatto è pulito (ha solo la vecchia messa), aggiorniamo anche il piatto e il dealer
      if ((currentPot - baseBet).abs() < 0.01 && players.isNotEmpty) {
         double difference = newBet - baseBet;
         // Il dealer corrente paga/riceve la differenza
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
    if (!canChangeBet) return false; // Bloccato se piatto sporco

    if (players.length < 15) { // Limite alzato visto che possono uscire
      players.add(Player(name: name));
      _autoSave();
      notifyListeners();
      return true;
    }
    return false;
  }
  
  void playerLeavesTable(String playerId) {
    if (!canChangeBet) return;

    final index = players.indexWhere((p) => p.id == playerId);
    if (index != -1) {
      players[index].isActive = false;
      
      // Se esce il dealer corrente, passiamo il token al prossimo attivo
      if (dealerIndex == index) {
        passDealerTokenToNextActive();
      }
      
      _autoSave();
      notifyListeners();
    }
  }

  // Sposta l'indice del dealer al prossimo giocatore che ha isActive = true
  void passDealerTokenToNextActive() {
     if (activePlayers.isEmpty) return;
     
     int nextIndex = dealerIndex;
     // Ciclo finché non trovo un attivo o torno a me stesso (se sono l'unico)
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

  void togglePlayerSelection(String playerId) {
    if (currentPhase == GamePhase.dealerSelection) return;

    // Cerca se già in un gruppo
    int existingGroupIndex = -1;
    for (int i = 0; i < selectionGroups.length; i++) {
      if (selectionGroups[i].contains(playerId)) {
        existingGroupIndex = i;
        break;
      }
    }

    // Rimuovi se presente
    if (existingGroupIndex != -1) {
      var group = selectionGroups[existingGroupIndex];
      group.remove(playerId);
      if (group.isEmpty) {
        selectionGroups.removeAt(existingGroupIndex);
      } 
      notifyListeners();
      return;
    }

    // Aggiungi
    if (isLinkingMode) {
      if (selectionGroups.isNotEmpty) {
        selectionGroups.last.add(playerId);
      } else {
        selectionGroups.add({playerId});
      }
    } else {
      if (currentPhase == GamePhase.pickingWinners && selectionGroups.length >= 3) {
        return; 
      }
      selectionGroups.add({playerId});
    }
    
    notifyListeners();
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
    
    passDealerTokenToNextActive();
    
    // Il nuovo dealer paga l'invito
    players[dealerIndex].score -= baseBet;
    currentPot += baseBet;
    
    _autoSave();
  }

  void startHand() {
    currentPhase = GamePhase.pickingWinners;
    selectionGroups.clear();
    isLinkingMode = false;
    _autoSave();
  }

  void confirmWinners() {
    if (selectionGroups.isEmpty) return;

    int numberOfEntities = selectionGroups.length;
    double amountPerEntity = currentPot / numberOfEntities;

    for (var group in selectionGroups) {
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

    if (activePlayers.isNotEmpty) {
      passDealerTokenToNextActive();
      
      // Nuovo dealer mette invito
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
    // Restituisci invito se piatto pulito
    if ((currentPot - baseBet).abs() < 0.01 && players.isNotEmpty) {
      players[dealerIndex].score += baseBet;
      currentPot = 0.0;
    }

    // Ordina tutti (anche chi è uscito)
    List<Player> rankedPlayers = List.from(players);
    rankedPlayers.sort((a, b) => b.score.compareTo(a.score));

    // Reset totale
    players = [];
    dealerIndex = 0;
    currentPot = 0.0;
    currentPhase = GamePhase.dealerSelection;
    selectionGroups.clear();
    _autoSave(); 

    return rankedPlayers;
  }
}
