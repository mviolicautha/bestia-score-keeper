import 'dart:math';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:bestia_scoreboard_application/logic/game_provider.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class GameTableScreen extends StatelessWidget {
  const GameTableScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final game = context.watch<GameProvider>();
    
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
          // SETTINGS
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.white70),
            tooltip: "Imposta Messa",
            onPressed: () => _showSettingsDialog(context),
          ),
          // TERMINA
          IconButton(
            icon: const Icon(Icons.flag, color: Colors.redAccent),
            tooltip: "Termina Partita",
            onPressed: () => _showEndGameDialog(context),
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
                  "${game.currentPot.toStringAsFixed(2)} €", 
                  style: const TextStyle(
                    color: Color(0xFFFFD700), fontSize: 40, fontWeight: FontWeight.bold
                  ),
                ),
                Text(
                  "(Messa: ${game.baseBet.toStringAsFixed(2)} €)",
                  style: const TextStyle(color: Colors.white30, fontSize: 12),
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

          // 3. BARRA CONTROLLI
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
            child: Text(player.name.isNotEmpty ? player.name[0].toUpperCase() : "?", 
                style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.black87)),
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
            "${player.name}\n${player.score.toStringAsFixed(2)}", 
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

  Widget _buildBottomControls(BuildContext context, GameProvider game) {
    switch (game.currentPhase) {
      case GamePhase.dealerSelection:
        bool canAddMore = game.players.length < 10;
        bool canPlay = game.players.length >= 5;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!canPlay)
              Padding(
                padding: const EdgeInsets.only(bottom: 8.0),
                child: Text(
                  "Minimo 5 giocatori per iniziare (${game.players.length}/5)",
                  style: const TextStyle(color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                ),
              ),

            Row(
              children: [
                Opacity(
                  opacity: canAddMore ? 1.0 : 0.5,
                  child: FloatingActionButton.small(
                    heroTag: "add", 
                    backgroundColor: canAddMore ? Colors.blueGrey : Colors.grey,
                    onPressed: canAddMore ? () => _showAddPlayerDialog(context) : null,
                    child: const Icon(Icons.person_add, color: Colors.white),
                  ),
                ),
                
                const SizedBox(width: 10),
                
                Expanded(
                  flex: 1,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.grey[700], 
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      disabledBackgroundColor: Colors.grey[800],
                    ),
                    onPressed: canPlay ? game.passHandWithoutPlaying : null,
                    child: Text("PASSA (+${game.baseBet.toStringAsFixed(2)})", 
                        style: const TextStyle(color: Colors.white, fontSize: 12)),
                  ),
                ),
                
                const SizedBox(width: 10),
                
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue, 
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      disabledBackgroundColor: Colors.blue[900]?.withOpacity(0.5),
                    ),
                    onPressed: canPlay ? game.startHand : null,
                    child: const Text("GIOCA MANO", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
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

  // --- DIALOGS ---

  void _showAddPlayerDialog(BuildContext context) {
      final controller = TextEditingController();
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: Colors.blueGrey[900],
          title: const Text("Nuovo Giocatore", style: TextStyle(color: Colors.white)),
          content: TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(
              hintText: "Nome",
              hintStyle: TextStyle(color: Colors.white54),
              enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white54)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text("Annulla", style: TextStyle(color: Colors.white54)),
            ),
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

   void _showSettingsDialog(BuildContext context) {
    final game = Provider.of<GameProvider>(context, listen: false);
    double tempBet = game.baseBet; 

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) {
          String displayBet = tempBet.toStringAsFixed(2);
          bool canDecrease = tempBet > 0.31; 

          return AlertDialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Text(
              "Imposta Messa",
              style: TextStyle(fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  "Modifica l'importo che il mazziere deve mettere ad ogni giro.",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey, fontSize: 13),
                ),
                const SizedBox(height: 24),
                
                // STEPPER UI
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey[100],
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey[300]!)
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // TASTO MENO
                      _buildStepperButton(
                        icon: Icons.remove,
                        isEnabled: canDecrease,
                        onPressed: () {
                          setState(() {
                            tempBet -= 0.30;
                            tempBet = double.parse(tempBet.toStringAsFixed(2));
                          });
                        },
                      ),

                      // VALORE CENTRALE (Solo numero)
                      Text(
                        "$displayBet €",
                        style: const TextStyle(
                          fontSize: 32, // Leggermente più grande
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF2E3B55),
                        ),
                      ),

                      // TASTO PIU
                      _buildStepperButton(
                        icon: Icons.add,
                        isEnabled: true,
                        onPressed: () {
                          setState(() {
                            tempBet += 0.30;
                            tempBet = double.parse(tempBet.toStringAsFixed(2));
                          });
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
            
            // ALLINEAMENTO PULSANTI
            // Usiamo actionsAlignment per distanziarli bene
            actionsAlignment: MainAxisAlignment.spaceBetween,
            actionsPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            actions: [
              // Tasto Annulla (Testo semplice a sinistra)
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                child: const Text("Annulla", style: TextStyle(color: Colors.grey, fontSize: 16)),
              ),
              
              // Tasto Salva (Bottone pieno a destra)
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2E3B55),
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  elevation: 2,
                ),
                onPressed: () {
                  game.setBaseBet(tempBet);
                  Navigator.pop(ctx);
                },
                child: const Text("SALVA", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            ],
          );
        }
      ),
    );
  }

  // Widget helper per i pulsanti quadrati +/-
  Widget _buildStepperButton({required IconData icon, required bool isEnabled, required VoidCallback onPressed}) {
    return Material(
      color: isEnabled ? Colors.white : Colors.grey[200],
      borderRadius: BorderRadius.circular(8),
      elevation: isEnabled ? 2 : 0,
      child: InkWell(
        onTap: isEnabled ? onPressed : null,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 50,
          height: 50,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: isEnabled ? Colors.grey[300]! : Colors.transparent),
          ),
          child: Icon(
            icon, 
            color: isEnabled ? Colors.black87 : Colors.grey[400], 
            size: 28
          ),
        ),
      ),
    );
  }
 
  void _showEndGameDialog(BuildContext context) {
    final game = Provider.of<GameProvider>(context, listen: false);

    // Check Piatto == BaseBet
    if ((game.currentPot - game.baseBet).abs() > 0.01) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Row(
            children: [Icon(Icons.error_outline, color: Colors.orange), SizedBox(width: 10), Text("Partita in corso")],
          ),
          content: Text(
            "Non puoi terminare la partita adesso!\n\n"
            "Il piatto contiene ancora ${game.currentPot.toStringAsFixed(2)} €.\n"
            "Dovete giocare finché il piatto non torna a ${game.baseBet.toStringAsFixed(2)} €."
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Ho capito")),
          ],
        ),
      );
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text("Terminare la partita?"),
        content: Text(
          "Il piatto è vuoto (${game.baseBet.toStringAsFixed(2)} €).\n"
          "Terminando ora, l'invito verrà restituito al mazziere e verranno calcolati i risultati finali."
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla")),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              Navigator.pop(ctx); 
              _processEndGame(context); 
            },
            child: const Text("TERMINA E CALCOLA", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _processEndGame(BuildContext context) {
    final results = Provider.of<GameProvider>(context, listen: false).endGame();

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.white,
        insetPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 20),
        child: Container(
          width: double.maxFinite,
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text("RISULTATI FINALI", style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black87)),
              const Divider(thickness: 2, color: Colors.black12),
              const SizedBox(height: 10),

              ...List.generate(results.length, (index) {
                final p = results[index];
                final isWinner = p.score > 0.001; // Tolleranza
                final isLoser = p.score < -0.001;
                Color rowColor = index % 2 == 0 ? Colors.grey[50]! : Colors.white;

                return Container(
                  color: rowColor,
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 30,
                        child: index == 0 
                          ? const Icon(Icons.emoji_events, color: Colors.amber, size: 24)
                          : Text("#${index + 1}", style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey), textAlign: TextAlign.center),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16), overflow: TextOverflow.ellipsis),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isWinner ? Colors.green[50] : (isLoser ? Colors.red[50] : Colors.grey[100]),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: isWinner ? Colors.green : (isLoser ? Colors.red : Colors.grey), width: 1)
                        ),
                        child: Text(
                          "${p.score > 0 ? '+' : ''}${p.score.toStringAsFixed(2)} €",
                          style: TextStyle(
                            color: isWinner ? Colors.green[800] : (isLoser ? Colors.red[800] : Colors.black54),
                            fontWeight: FontWeight.bold, fontSize: 16,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),

              const Spacer(), 
              const SizedBox(height: 20),
              
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  label: const Text("NUOVA PARTITA", style: TextStyle(color: Colors.white)),
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E3B55), padding: const EdgeInsets.symmetric(vertical: 14)),
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
