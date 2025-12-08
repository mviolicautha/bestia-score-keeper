import 'package:flutter/material.dart';
import 'package:bestia_scoreboard_application/data/database_helper.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class GameProvider extends ChangeNotifier {
  List<Player> players = [];
  int dealerIndex = 0;
  int currentPot = 0; 
  GamePhase currentPhase = GamePhase.dealerSelection;
  
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
      score: m['score']
    )).toList();

    dealerIndex = data['dealerIndex'] as int;
    currentPot = data['currentPot'] as int;
    
    int phaseIndex = data['gamePhase'] as int;
    if (phaseIndex >= 0 && phaseIndex < GamePhase.values.length) {
      currentPhase = GamePhase.values[phaseIndex];
    } else {
      currentPhase = GamePhase.dealerSelection;
    }

    isLoading = false;
    notifyListeners();
  }

  void _autoSave() {
    DatabaseHelper.instance.saveGame(
      players, 
      dealerIndex, 
      currentPot, 
      currentPhase.index
    );
    notifyListeners();
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

  // FASE 1 -> FASE 1 (Giro a vuoto / Passa Mazzo)
  void passHandWithoutPlaying() {
    if (players.isEmpty) return;
    
    // 1. Il DEALER ATTUALE paga 1 al piatto (penalità per non aver giocato/passato)
    // O è il NUOVO dealer che paga l'invito? 
    // Di solito: "Passo" -> il mazzo gira -> il NUOVO dealer mette l'invito.
    // Interpretiamo la tua richiesta: "il piatto viene alzato di 1... presi dai giocatori".
    
    // Logica: Spostiamo il dealer, e il NUOVO dealer paga l'invito obbligatorio.
    dealerIndex = (dealerIndex + 1) % players.length;
    
    Player newDealer = players[dealerIndex];
    newDealer.score -= 1; // Preleviamo dal giocatore
    currentPot += 1;      // Mettiamo nel piatto
    
    _autoSave();
  }

  // FASE 1 -> FASE 2 (Inizia la mano)
  void startHand() {
    currentPhase = GamePhase.pickingWinners;
    selectedPlayerIds.clear();
    _autoSave();
  }

  // FASE 2 -> FASE 3 (Distribuzione vincite)
  void confirmWinners() {
    if (selectedPlayerIds.isEmpty) return;

    int numWinners = selectedPlayerIds.length;
    int splitAmount = (currentPot / numWinners).floor(); 
    
    // I vincitori prendono i soldi DAL PIATTO
    for (String id in selectedPlayerIds) {
      final player = players.firstWhere((p) => p.id == id);
      player.score += splitAmount;
    }
    
    // Nota: Il 'currentPot' rimane tecnicamente invariato nel valore numerico
    // per usarlo come riferimento per le penalità ("paghi quanto c'era nel piatto").
    // Ma i soldi sono stati distribuiti.

    currentPhase = GamePhase.pickingLosers;
    selectedPlayerIds.clear(); 
    _autoSave();
  }

  // FASE 3 -> FASE 1 (Penalità e Nuovo Piatto)
  void confirmLosersAndEndHand() {
    int penaltyAmount = currentPot; 
    int totalPenaltiesCollected = 0;

    // 1. I PERDENTI pagano le penalità
    for (String id in selectedPlayerIds) {
      final player = players.firstWhere((p) => p.id == id);
      player.score -= penaltyAmount; // Escono dalle tasche
      totalPenaltiesCollected += penaltyAmount;
    }

    // 2. Sposta il Dealer
    if (players.isNotEmpty) {
      dealerIndex = (dealerIndex + 1) % players.length;
      
      // 3. Il NUOVO Dealer paga l'invito obbligatorio (+1)
      Player newDealer = players[dealerIndex];
      newDealer.score -= 1; // Esce dalla tasca
      
      // 4. Calcolo Nuovo Piatto
      // Piatto = (Soldi raccolti dai perdenti) + (1 euro del nuovo dealer)
      currentPot = totalPenaltiesCollected + 1; 
    } else {
      currentPot = 0;
    }

    currentPhase = GamePhase.dealerSelection;
    selectedPlayerIds.clear();
    
    _autoSave();
  }
}
