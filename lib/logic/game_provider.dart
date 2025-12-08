import 'package:flutter/material.dart';
import 'package:bestia_scoreboard_application/data/database_helper.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class GameProvider extends ChangeNotifier {
  List<Player> players = [];
  int dealerIndex = 0;
  double currentPot = 0.0;
  GamePhase currentPhase = GamePhase.dealerSelection;
  double baseBet = 0.30; 

  // NUOVA STRUTTURA SELEZIONE: Lista di Gruppi
  // Ogni elemento della lista è un Set di ID che formano un'entità (singola o società)
  List<Set<String>> selectionGroups = [];

  // Modalità "Link" attiva? Se true, i click aggiungono all'ultimo gruppo creato invece di crearne uno nuovo
  bool isLinkingMode = false;

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
      score: (m['score'] as num).toDouble(),
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
    // Nota: Non salviamo la selezione temporanea nel DB perché è effimera. 
    // Se l'app crasha mentre selezioni i vincitori, al riavvio dovrai riselezionarli.
    DatabaseHelper.instance.saveGame(
      players, dealerIndex, currentPot, currentPhase.index, baseBet
    );
    notifyListeners();
  }

  void setBaseBet(double newBet) {
    double remainder = newBet % 0.30;
    if (remainder < 0.001 || (0.30 - remainder) < 0.001) {     
      if ((currentPot - baseBet).abs() < 0.01 && players.isNotEmpty) {
         double difference = newBet - baseBet;
         players[dealerIndex].score -= difference;
         currentPot = newBet;
      }
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

  // --- NUOVA LOGICA DI SELEZIONE ---

  // Attiva/Disattiva la modalità Creazione Società
  void toggleLinkingMode() {
    isLinkingMode = !isLinkingMode;
    // Se attivo la modalità link, preparo un nuovo gruppo vuoto se l'ultimo è pieno/chiuso?
    // No, la logica è:
    // 1. Clicco "Link" -> Diventa attivo.
    // 2. Clicco Player A -> Crea Gruppo X con A.
    // 3. Clicco Player B -> Aggiunge B al Gruppo X.
    // 4. Clicco Player C -> Aggiunge C al Gruppo X.
    // 5. Spengo "Link".
    // 6. Clicco Player D -> Crea Gruppo Y con D (singolo).
    notifyListeners();
  }

  void togglePlayerSelection(String playerId) {
    if (currentPhase == GamePhase.dealerSelection) return;

    // 1. Cerca se il giocatore è già in un gruppo
    int existingGroupIndex = -1;
    for (int i = 0; i < selectionGroups.length; i++) {
      if (selectionGroups[i].contains(playerId)) {
        existingGroupIndex = i;
        break;
      }
    }

    // CASO A: Il giocatore è GIÀ selezionato -> LO RIMUOVIAMO
    if (existingGroupIndex != -1) {
      var group = selectionGroups[existingGroupIndex];
      group.remove(playerId);
      // Se il gruppo diventa vuoto, lo eliminiamo
      if (group.isEmpty) {
        selectionGroups.removeAt(existingGroupIndex);
      } 
      // Se il gruppo aveva altri membri, restano lì (separazione dalla società)
      notifyListeners();
      return;
    }

    // CASO B: Il giocatore NON è selezionato -> LO AGGIUNGIAMO

    if (isLinkingMode) {
      // Se siamo in modalità LINK, cerchiamo l'ultimo gruppo attivo o ne creiamo uno
      if (selectionGroups.isNotEmpty) {
        // Aggiungiamo all'ultimo gruppo creato
        selectionGroups.last.add(playerId);
      } else {
        // Se non ci sono gruppi, ne creiamo uno nuovo
        selectionGroups.add({playerId});
      }
    } else {
      // Modalità NORMALE (Singolo): Crea sempre un nuovo gruppo da 1
      // Controllo limiti solo per vincitori (Max 3 entità vincenti?)
      if (currentPhase == GamePhase.pickingWinners && selectionGroups.length >= 3) {
        // Limite raggiunto di GRUPPI, non di persone
        return; 
      }
      selectionGroups.add({playerId});
    }
    
    notifyListeners();
  }
  
  // Helper per sapere il colore/gruppo di un player nella UI
  // Restituisce l'indice del gruppo (0, 1, 2...) o -1 se non selezionato
  int getPlayerGroupIndex(String playerId) {
    for (int i = 0; i < selectionGroups.length; i++) {
      if (selectionGroups[i].contains(playerId)) return i;
    }
    return -1;
  }

  // --- GESTIONE FASI ---

  void passHandWithoutPlaying() {
    if (players.isEmpty) return;
    dealerIndex = (dealerIndex + 1) % players.length;
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

    // 1. Dividiamo il piatto per il numero di ENTITÀ (Gruppi)
    int numberOfEntities = selectionGroups.length;
    double amountPerEntity = currentPot / numberOfEntities;

    // 2. Distribuiamo la vincita dentro ogni gruppo
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

  void confirmLosersAndEndHand() 
  {
    // NOTA: Qui NON controlliamo if (selectionGroups.isEmpty) return;
    // È perfettamente lecito che non ci siano perdenti.
    
    // La penalità TOTALE da recuperare è pari al piatto precedente
    double totalDebtToPay = currentPot; 
    
    double collected = 0.0;

    // Se selectionGroups è vuoto, questo ciclo salta e collected resta 0.0
    // Corretto: nessuno paga nulla.
    for (var group in selectionGroups) {
      int membersCount = group.length;
      double penaltyPerPlayer = totalDebtToPay / membersCount;

      for (String id in group) {
        final player = players.firstWhere((p) => p.id == id);
        player.score -= penaltyPerPlayer;
        collected += penaltyPerPlayer;
      }
    }

    if (players.isNotEmpty) {
      dealerIndex = (dealerIndex + 1) % players.length;
      
      // Nuovo Dealer mette invito
      Player newDealer = players[dealerIndex];
      newDealer.score -= baseBet;
      
      // Nuovo Piatto = Penalità raccolte + Invito base
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

    double totalScore = players.fold(0.0, (sum, p) => sum + p.score);
    if (totalScore.abs() > 0.01) {
      debugPrint("ERRORE CONTABILE: $totalScore");
    }

    List<Player> rankedPlayers = List.from(players);
    rankedPlayers.sort((a, b) => b.score.compareTo(a.score));

    players = [];
    dealerIndex = 0;
    currentPot = 0.0;
    currentPhase = GamePhase.dealerSelection;
    selectionGroups.clear();
    _autoSave(); 

    return rankedPlayers;
  }

  bool get canChangeBet {
    // Tolleranza float
    if (currentPot < 0.01) return true; // Piatto vuoto
    if ((currentPot - baseBet).abs() < 0.01) return true; // Piatto ha solo l'invito
    return false; // Piatto sporco (penalità in corso)
  }
}
