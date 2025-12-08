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
        statusText = "SELEZIONA VINCITORI";
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
          // SETTINGS (Modificato)
          IconButton(
            icon: Icon(
              Icons.settings, 
              // Feedback visivo: grigio scuro se disabilitato, bianco se abilitato
              color: game.canChangeBet ? Colors.white70 : Colors.white24 
            ),
            tooltip: "Imposta Messa",
            onPressed: () {
              if (game.canChangeBet) {
                _showSettingsDialog(context);
              } else {
                // Mostra avviso se non si può cambiare
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text("Non puoi cambiare la Messa mentre c'è un piatto in corso! Attendi che si svuoti."),
                    backgroundColor: Colors.orange,
                    duration: Duration(seconds: 2),
                  )
                );
              }
            },
          ),
          // TERMINA (Invariato)
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
          Container(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Column(
              children: [
                const Text("PIATTO", style: TextStyle(color: Colors.white54, letterSpacing: 2)),
                Text("${game.currentPot.toStringAsFixed(2)} €", style: const TextStyle(color: Color(0xFFFFD700), fontSize: 40, fontWeight: FontWeight.bold)),
                Text("(Messa: ${game.baseBet.toStringAsFixed(2)} €)", style: const TextStyle(color: Colors.white30, fontSize: 12)),
              ],
            ),
          ),

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
                        Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF35654d),
                            shape: BoxShape.circle,
                            border: Border.all(color: const Color(0xFF5D4037), width: 12),
                            boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 20)],
                          ),
                        ),
                        
                        ...List.generate(game.players.length, (index) {
                          final p = game.players[index];
                          final double angle = (2 * pi * index) / game.players.length - (pi / 2);
                          final double playerRadius = radius - 45; 
                          
                          // Ottieni indice del gruppo per colorare
                          int groupIndex = game.getPlayerGroupIndex(p.id);
                          
                          return Transform.translate(
                            offset: Offset(playerRadius * cos(angle), playerRadius * sin(angle)),
                            child: GestureDetector(
                              onTap: () => game.togglePlayerSelection(p.id),
                              child: _buildPlayerAvatar(p, groupIndex, game.currentPhase),
                            ),
                          );
                        }),

                        if (game.players.isNotEmpty)
                          _buildDealerToken(radius, game.players.length, game.dealerIndex),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

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

  Widget _buildPlayerAvatar(Player player, int groupIndex, GamePhase phase) {
    Color borderColor = Colors.transparent;
    double borderWidth = 0;
    
    // Palette colori per i gruppi (fino a 4 gruppi diversi, poi cicla)
    List<Color> groupColors = [
      Colors.greenAccent,
      Colors.cyanAccent,
      Colors.orangeAccent,
      Colors.purpleAccent,
    ];

    if (phase == GamePhase.pickingLosers) {
      // In fase perdenti usiamo toni di rosso/arancio
      groupColors = [
        Colors.redAccent,
        Colors.deepOrangeAccent,
        Colors.pinkAccent,
        Colors.amberAccent,
      ];
    }

    if (groupIndex != -1) {
      borderWidth = 4;
      borderColor = groupColors[groupIndex % groupColors.length];
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
    // FASE 1: NORMALE
    if (game.currentPhase == GamePhase.dealerSelection) {
        bool canAddMore = game.players.length < 10;
        bool canPlay = game.players.length >= 5;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!canPlay)
              const Padding(padding: EdgeInsets.only(bottom: 8.0), child: Text("Minimo 5 giocatori", style: TextStyle(color: Colors.orangeAccent))),
            Row(
              children: [
                Opacity(
                  opacity: canAddMore ? 1.0 : 0.5,
                  child: FloatingActionButton.small(heroTag: "add", backgroundColor: canAddMore ? Colors.blueGrey : Colors.grey, onPressed: canAddMore ? () => _showAddPlayerDialog(context) : null, child: const Icon(Icons.person_add, color: Colors.white)),
                ),
                const SizedBox(width: 10),
                Expanded(child: ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.grey[700], padding: const EdgeInsets.symmetric(vertical: 16)), onPressed: canPlay ? game.passHandWithoutPlaying : null, child: Text("PASSA (+${game.baseBet.toStringAsFixed(2)})", style: const TextStyle(color: Colors.white, fontSize: 12)))),
                const SizedBox(width: 10),
                Expanded(flex: 2, child: ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, padding: const EdgeInsets.symmetric(vertical: 16)), onPressed: canPlay ? game.startHand : null, child: const Text("GIOCA MANO", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)))),
              ],
            ),
          ],
        );
    }

    // FASE 2 e 3: SELEZIONE CON LINKING
    Color btnColor = game.currentPhase == GamePhase.pickingWinners ? Colors.green : Colors.redAccent;
    String btnText = game.currentPhase == GamePhase.pickingWinners ? "CONFERMA VINCITORI" : "FINE MANO";
    VoidCallback? onConfirm;
    if (game.currentPhase == GamePhase.pickingWinners) {
      // Per i vincitori, richiediamo almeno una selezione
      onConfirm = game.selectionGroups.isEmpty ? null : game.confirmWinners;
    } else {
      // Per i perdenti, va bene anche vuoto (Nessuno ha perso)
      onConfirm = game.confirmLosersAndEndHand;
    }

    return Row(
      children: [
        // Pulsante LINK (Società)
        Container(
          margin: const EdgeInsets.only(right: 12),
          decoration: BoxDecoration(
            color: game.isLinkingMode ? Colors.amber : Colors.grey[800],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: game.isLinkingMode ? Colors.amberAccent : Colors.transparent, width: 2)
          ),
          child: IconButton(
            icon: Icon(Icons.link, color: game.isLinkingMode ? Colors.black : Colors.white),
            tooltip: "Crea Società (Collega giocatori)",
            onPressed: game.toggleLinkingMode,
          ),
        ),
        
        // Pulsante Conferma
        Expanded(
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: btnColor, padding: const EdgeInsets.symmetric(vertical: 16)),
            onPressed: onConfirm,
            child: Text(btnText, style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ),
      ],
    );
  }

  // --- DIALOGS (Invariati) ---
  void _showAddPlayerDialog(BuildContext context) {
      final controller = TextEditingController();
      showDialog(context: context, builder: (ctx) => AlertDialog(
          backgroundColor: Colors.blueGrey[900],
          title: const Text("Nuovo Giocatore", style: TextStyle(color: Colors.white)),
          content: TextField(controller: controller, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Nome", hintStyle: TextStyle(color: Colors.white54), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white54)))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla", style: TextStyle(color: Colors.white54))),
            ElevatedButton(onPressed: () {
                if (controller.text.isNotEmpty) {
                  Provider.of<GameProvider>(context, listen: false).addPlayer(controller.text);
                  Navigator.pop(ctx);
                }
              }, child: const Text("Aggiungi"))
          ],
        ));
  }

  void _showSettingsDialog(BuildContext context) {
    final game = Provider.of<GameProvider>(context, listen: false);
    double tempBet = game.baseBet; 
    showDialog(context: context, builder: (ctx) => StatefulBuilder(
        builder: (context, setState) {
          String displayBet = tempBet.toStringAsFixed(2);
          bool canDecrease = tempBet > 0.31; 
          return AlertDialog(
            backgroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Text("Imposta Messa", style: TextStyle(fontWeight: FontWeight.bold)),
            content: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text("Modifica l'importo che il mazziere deve mettere ad ogni giro.", textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 13)),
                const SizedBox(height: 24),
                Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8), decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey[300]!)), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      _buildStepperButton(icon: Icons.remove, isEnabled: canDecrease, onPressed: () { setState(() { tempBet -= 0.30; tempBet = double.parse(tempBet.toStringAsFixed(2)); }); }),
                      Text("$displayBet €", style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Color(0xFF2E3B55))),
                      _buildStepperButton(icon: Icons.add, isEnabled: true, onPressed: () { setState(() { tempBet += 0.30; tempBet = double.parse(tempBet.toStringAsFixed(2)); }); }),
                    ])),
              ]),
            actionsAlignment: MainAxisAlignment.spaceBetween,
            actionsPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla", style: TextStyle(color: Colors.grey, fontSize: 16))),
              ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E3B55), padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12)), onPressed: () { game.setBaseBet(tempBet); Navigator.pop(ctx); }, child: const Text("SALVA", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16))),
            ],
          );
        }));
  }

  Widget _buildStepperButton({required IconData icon, required bool isEnabled, required VoidCallback onPressed}) {
    return Material(color: isEnabled ? Colors.white : Colors.grey[200], borderRadius: BorderRadius.circular(8), elevation: isEnabled ? 2 : 0, child: InkWell(onTap: isEnabled ? onPressed : null, borderRadius: BorderRadius.circular(8), child: Container(width: 50, height: 50, alignment: Alignment.center, decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: isEnabled ? Colors.grey[300]! : Colors.transparent)), child: Icon(icon, color: isEnabled ? Colors.black87 : Colors.grey[400], size: 28))));
  }

  void _showEndGameDialog(BuildContext context) {
    final game = Provider.of<GameProvider>(context, listen: false);
    if ((game.currentPot - game.baseBet).abs() > 0.01) {
      showDialog(context: context, builder: (ctx) => AlertDialog(title: const Row(children: [Icon(Icons.error_outline, color: Colors.orange), SizedBox(width: 10), Text("Partita in corso")]), content: Text("Non puoi terminare la partita adesso!\n\nIl piatto contiene ancora ${game.currentPot.toStringAsFixed(2)} €.\nDovete giocare finché il piatto non torna a ${game.baseBet.toStringAsFixed(2)} €."), actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Ho capito"))]));
      return;
    }
    showDialog(context: context, barrierDismissible: false, builder: (ctx) => AlertDialog(title: const Text("Terminare la partita?"), content: Text("Il piatto è vuoto (${game.baseBet.toStringAsFixed(2)} €).\nTerminando ora, l'invito verrà restituito al mazziere e verranno calcolati i risultati finali."), actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla")), ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.red), onPressed: () { Navigator.pop(ctx); _processEndGame(context); }, child: const Text("TERMINA E CALCOLA", style: TextStyle(color: Colors.white)))]));
  }

  void _processEndGame(BuildContext context) {
    final results = Provider.of<GameProvider>(context, listen: false).endGame();
    showDialog(context: context, barrierDismissible: false, builder: (ctx) => Dialog(backgroundColor: Colors.white, insetPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 20), child: Container(width: double.maxFinite, padding: const EdgeInsets.all(16), child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Text("RISULTATI FINALI", style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.black87)),
              const Divider(thickness: 2, color: Colors.black12),
              const SizedBox(height: 10),
              ...List.generate(results.length, (index) {
                final p = results[index];
                final isWinner = p.score > 0.001;
                final isLoser = p.score < -0.001;
                Color rowColor = index % 2 == 0 ? Colors.grey[50]! : Colors.white;
                return Container(color: rowColor, padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4), child: Row(children: [
                      SizedBox(width: 30, child: index == 0 ? const Icon(Icons.emoji_events, color: Colors.amber, size: 24) : Text("#${index + 1}", style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey), textAlign: TextAlign.center)),
                      const SizedBox(width: 10),
                      Expanded(child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16), overflow: TextOverflow.ellipsis)),
                      Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: isWinner ? Colors.green[50] : (isLoser ? Colors.red[50] : Colors.grey[100]), borderRadius: BorderRadius.circular(8), border: Border.all(color: isWinner ? Colors.green : (isLoser ? Colors.red : Colors.grey), width: 1)), child: Text("${p.score > 0 ? '+' : ''}${p.score.toStringAsFixed(2)} €", style: TextStyle(color: isWinner ? Colors.green[800] : (isLoser ? Colors.red[800] : Colors.black54), fontWeight: FontWeight.bold, fontSize: 16))),
                    ]));
              }),
              const Spacer(), const SizedBox(height: 20),
              SizedBox(width: double.infinity, child: ElevatedButton.icon(icon: const Icon(Icons.refresh, color: Colors.white), label: const Text("NUOVA PARTITA", style: TextStyle(color: Colors.white)), style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E3B55), padding: const EdgeInsets.symmetric(vertical: 14)), onPressed: () => Navigator.pop(ctx))),
            ]))));
  }
}
