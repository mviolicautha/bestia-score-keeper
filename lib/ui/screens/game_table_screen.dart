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
}
