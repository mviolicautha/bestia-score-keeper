import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bestia_scoreboard_application/logic/game_provider.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart'; // Importa per l'Enum

class GameTableScreen extends StatelessWidget {
  const GameTableScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameProvider>();
    
    // Titolo dinamico in base alla fase
    String statusText = "";
    Color statusColor = Colors.white;
    switch (game.currentPhase) {
      case GamePhase.dealerSelection:
        statusText = "MANO IN CORSO";
        statusColor = Colors.white;
        break;
      case GamePhase.pickingWinners:
        statusText = "SELEZIONA VINCITORI (1-3)";
        statusColor = Colors.greenAccent;
        break;
      case GamePhase.pickingLosers:
        statusText = "SELEZIONA BUSSATI (PERDENTI)";
        statusColor = Colors.redAccent;
        break;
    }

    if (game.isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(
        title: Text(statusText, style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 16)),
        centerTitle: true,
        backgroundColor: const Color(0xFF2E3B55),
        elevation: 0,
        actions: [
          // Tasto TERMINA PARTITA
          IconButton(
            icon: const Icon(Icons.flag, color: Colors.redAccent),
            onPressed: () => _showEndGameDialog(context),
            tooltip: "Termina Partita",
          ),
        ],
      ),
      backgroundColor: const Color(0xFF2E3B55),
      body: Column(
        children: [
          // 1. INFO PIATTO
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Column(
              children: [
                const Text("PIATTO", style: TextStyle(color: Colors.white54, letterSpacing: 2)),
                Text(
                  "${game.currentPot}", // DATO REALE
                  style: const TextStyle(
                    color: Color(0xFFFFD700), fontSize: 48, fontWeight: FontWeight.bold
                  ),
                ),
              ],
            ),
          ),

          // 2. TAVOLO
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final double tableDiameter = min(constraints.maxWidth, constraints.maxHeight) - 40;
                final double radius = tableDiameter / 2;

                return Center(
                  child: SizedBox(
                    width: tableDiameter, height: tableDiameter,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        // Panno Verde
                        Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF35654d),
                            shape: BoxShape.circle,
                            border: Border.all(color: const Color(0xFF5D4037), width: 12),
                            boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 20)],
                          ),
                        ),
                        
                        // Giocatori
                        ...List.generate(game.players.length, (index) {
                          final p = game.players[index];
                          final double angle = (2 * pi * index) / game.players.length - (pi / 2);
                          final double playerRadius = radius - 45; 
                          
                          // Verifica se è selezionato
                          bool isSelected = game.selectedPlayerIds.contains(p.id);
                          
                          return Transform.translate(
                            offset: Offset(playerRadius * cos(angle), playerRadius * sin(angle)),
                            child: GestureDetector(
                              onTap: () => game.togglePlayerSelection(p.id),
                              child: _buildPlayerAvatar(p, isSelected, game.currentPhase),
                            ),
                          );
                        }),

                        // Dealer Token
                        if (game.players.isNotEmpty)
                          _buildDealerToken(radius, game.players.length, game.dealerIndex),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // 3. BARRA CONTROLLI (DINAMICA)
          Container(
            padding: const EdgeInsets.all(20),
            color: Colors.black26,
            child: SafeArea(
              child: _buildBottomControls(context, game),
            ),
          ),
        ],
      ),
    );
  }

  // Widget Avatar con bordo di selezione
  Widget _buildPlayerAvatar(Player player, bool isSelected, GamePhase phase) {
    Color borderColor = Colors.transparent;
    double borderWidth = 0;

    if (isSelected) {
      borderWidth = 4;
      if (phase == GamePhase.pickingWinners) borderColor = Colors.greenAccent;
      if (phase == GamePhase.pickingLosers) borderColor = Colors.redAccent;
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: borderColor, width: borderWidth),
          ),
          child: CircleAvatar(
            radius: 22,
            backgroundColor: Colors.white,
            child: Text(player.name[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: Colors.black87,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            "${player.name}\n${player.score}", 
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 10),
          ),
        ),
      ],
    );
  }

  Widget _buildDealerToken(double tableRadius, int playerCount, int dealerIndex) {
    final double tokenRadius = tableRadius - 90;
    final double angle = (2 * pi * dealerIndex) / playerCount - (pi / 2);
    return Transform.translate(
      offset: Offset(tokenRadius * cos(angle), tokenRadius * sin(angle)),
      child: Container(
        width: 30, height: 30,
        decoration: const BoxDecoration(color: Colors.yellow, shape: BoxShape.circle),
        child: const Center(child: Text("D", style: TextStyle(fontWeight: FontWeight.bold))),
      ),
    );
  }

  // LOGICA DEI BOTTONI IN BASSO
  Widget _buildBottomControls(BuildContext context, GameProvider game) {
    switch (game.currentPhase) {
      case GamePhase.dealerSelection:
        return Row(
          children: [
            // Aggiungi giocatore (Solo in fase 1)
            FloatingActionButton.small(
              heroTag: "add", backgroundColor: Colors.blueGrey,
              onPressed: () => _showAddPlayerDialog(context),
              child: const Icon(Icons.person_add, color: Colors.white),
            ),
            const SizedBox(width: 10),
            // Bottone "Giro a vuoto"
            Expanded(
              flex: 1,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.grey[700], padding: const EdgeInsets.symmetric(vertical: 16)),
                onPressed: game.passHandWithoutPlaying,
                child: const Text("PASSA (+1)", style: TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 10),
            // Bottone "Gioca"
            Expanded(
              flex: 2,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, padding: const EdgeInsets.symmetric(vertical: 16)),
                onPressed: game.startHand,
                child: const Text("GIOCA MANO", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        );

      case GamePhase.pickingWinners:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green, padding: const EdgeInsets.symmetric(vertical: 16)),
            onPressed: game.selectedPlayerIds.isEmpty ? null : game.confirmWinners,
            child: const Text("CONFERMA VINCITORI", style: TextStyle(fontSize: 18, color: Colors.white)),
          ),
        );

      case GamePhase.pickingLosers:
        return SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, padding: const EdgeInsets.symmetric(vertical: 16)),
            onPressed: game.confirmLosersAndEndHand,
            child: const Text("FINE MANO (CALCOLA)", style: TextStyle(fontSize: 18, color: Colors.white)),
          ),
        );
    }
  }
  
  void _showAddPlayerDialog(BuildContext context) {
      // ... (stesso codice di prima) ...
      final controller = TextEditingController();
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Colors.blueGrey[900],
          title: const Text("Nuovo Giocatore", style: TextStyle(color: Colors.white)),
          content: TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white),
          ),
          actions: [
             ElevatedButton(
              onPressed: () {
                if (controller.text.isNotEmpty) {
                  Provider.of<GameProvider>(context, listen: false).addPlayer(controller.text);
                  Navigator.pop(ctx);
                }
              },
              child: const Text("Aggiungi"),
            )
          ],
        ),
      );
  }

    void _showEndGameDialog(BuildContext context) {
    showDialog(
      context: context,
      barrierDismissible: false, // Impedisce di chiudere cliccando fuori
      builder: (ctx) => AlertDialog(
        title: const Text("Terminare la partita?"),
        content: const Text("Questa azione resetterà tutti i punteggi e mostrerà la classifica finale."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Annulla"),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              Navigator.pop(ctx); // Chiudi il dialog di conferma
              _processEndGame(context); // Mostra risultati
            },
            child: const Text("TERMINA", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _processEndGame(BuildContext context) {
    // Ottieni i risultati e resetta
    final results = Provider.of<GameProvider>(context, listen: false).endGame();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.white,
        insetPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 20), // Margini ridotti
        child: Container(
          width: double.maxFinite, // Occupa larghezza disponibile
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min, // Si adatta al contenuto
            children: [
              // Header
              const Text(
                "RISULTATI FINALI",
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black87),
              ),
              const Divider(thickness: 2, color: Colors.black12),
              
              const SizedBox(height: 10),

              // TABELLA COMPATTA (Senza Scroll)
              // Usiamo Flexible per dire "usa lo spazio che serve ma non scrollare se possibile"
              // Se i giocatori sono 10, riduciamo leggermente il font o lo spazio
              ...List.generate(results.length, (index) {
                final p = results[index];
                final isWinner = p.score > 0;
                final isLoser = p.score < 0;
                Color rowColor = index % 2 == 0 ? Colors.grey[50]! : Colors.white; // Zebra striping

                return Container(
                  color: rowColor,
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      // POSIZIONE
                      SizedBox(
                        width: 30,
                        child: index == 0 
                          ? const Icon(Icons.emoji_events, color: Colors.amber, size: 24)
                          : Text(
                              "#${index + 1}", 
                              style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey),
                              textAlign: TextAlign.center,
                            ),
                      ),
                      const SizedBox(width: 10),
                      
                      // NOME
                      Expanded(
                        child: Text(
                          p.name,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                          overflow: TextOverflow.ellipsis, // Se il nome è lunghissimo lo taglia
                        ),
                      ),

                      // PUNTEGGIO
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isWinner ? Colors.green[50] : (isLoser ? Colors.red[50] : Colors.grey[100]),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: isWinner ? Colors.green : (isLoser ? Colors.red : Colors.grey),
                            width: 1
                          )
                        ),
                        child: Text(
                          "${p.score > 0 ? '+' : ''}${p.score} €",
                          style: TextStyle(
                            color: isWinner ? Colors.green[800] : (isLoser ? Colors.red[800] : Colors.black54),
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),

              const Spacer(), // Spinge il bottone in fondo se c'è spazio extra

              const SizedBox(height: 20),
              
              // FOOTER CON BOTTONE
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text("NUOVA PARTITA", style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E3B55),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
