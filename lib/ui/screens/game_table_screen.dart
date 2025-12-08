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
    
    // Status Bar & Colori
    String statusText = "";
    Color statusColor = Colors.white;
    switch (game.currentPhase) {
      case GamePhase.dealerSelection:
        statusText = "MANO IN CORSO";
        break;
      case GamePhase.pickingWinners:
        statusText = "SELEZIONA VINCITORI";
        statusColor = Colors.greenAccent;
        break;
      case GamePhase.pickingLosers:
        statusText = "SELEZIONA BUSSATI";
        statusColor = Colors.redAccent;
        break;
    }

    if (game.isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(
        title: Text(statusText, style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 18)),
        centerTitle: true,
        backgroundColor: const Color(0xFF1A233A), // Blu ancora più scuro per contrasto
        elevation: 0,
        actions: [
          IconButton(
            icon: Icon(Icons.settings, color: game.canChangeBet ? Colors.white : Colors.white24),
            onPressed: () {
              if (game.canChangeBet) {
                _showSettingsDialog(context);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossibile cambiare Messa a partita in corso!"), backgroundColor: Colors.orange));
              }
            },
          ),
          IconButton(icon: const Icon(Icons.flag, color: Colors.redAccent), onPressed: () => _showEndGameDialog(context)),
        ],
      ),
      backgroundColor: const Color(0xFF1A233A),
      body: Column(
        children: [
          // HEADER PIATTO (Più compatto)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(
              children: [
                const Text("PIATTO", style: TextStyle(color: Colors.white38, letterSpacing: 2, fontSize: 10)),
                Text("${game.currentPot.toStringAsFixed(2)} €", style: const TextStyle(color: Color(0xFFFFD700), fontSize: 42, fontWeight: FontWeight.bold, height: 1.0)),
                Text("Messa: ${game.baseBet.toStringAsFixed(2)} €", style: const TextStyle(color: Colors.white24, fontSize: 11)),
              ],
            ),
          ),

          // TAVOLO
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                // Massimizziamo il tavolo
                // Lasciamo meno margine (20px)
                final double tableDiameter = min(constraints.maxWidth, constraints.maxHeight) - 20;
                final double radius = tableDiameter / 2;

                return Center(
                  child: SizedBox(
                    width: tableDiameter, height: tableDiameter,
                    child: Stack(
                      alignment: Alignment.center,
                      clipBehavior: Clip.none, // Permette agli avatar di sbordare un po'
                      children: [
                        // 1. Tavolo (Panno)
                        Container(
                          decoration: BoxDecoration(
                            color: const Color(0xFF2E7D32), // Verde più intenso
                            shape: BoxShape.circle,
                            border: Border.all(color: const Color(0xFF4E342E), width: 8), // Bordo più sottile
                            boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 25, spreadRadius: 5)],
                          ),
                        ),
                        
                        // 2. Logo Centrale (Decorativo)
                       Opacity
                       (
                          opacity: 0.1,
                          child: Text(
                            "\u2660", // Simbolo Picche Unicode
                            style: TextStyle(
                              fontSize: tableDiameter * 0.5, 
                              color: Colors.black,
                              height: 1.0, // Rimuove padding verticale extra del font
                            ),
                          ),
                        ),

                        // 3. Giocatori
                        ...List.generate(game.players.length, (index) {
                          final p = game.players[index];
                          // Distribuzione angolare
                          final double angle = (2 * pi * index) / game.players.length - (pi / 2);
                          
                          // Raggio posizionamento: Li mettiamo quasi sul bordo
                          // radius - 35px offset per centrare l'avatar sul bordo interno
                          final double playerRadius = radius - 35; 
                          
                          int groupIndex = game.getPlayerGroupIndex(p.id);
                          
                          return Transform.translate(
                            offset: Offset(playerRadius * cos(angle), playerRadius * sin(angle)),
                            child: GestureDetector(
                              onTap: () => game.togglePlayerSelection(p.id),
                              child: _buildEnhancedPlayerAvatar(p, groupIndex, game.currentPhase, angle),
                            ),
                          );
                        }),

                        // 4. Dealer Token
                        if (game.players.isNotEmpty)
                          _buildDealerToken(radius, game.players.length, game.dealerIndex),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // CONTROLLI
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
            color: const Color(0xFF121826),
            child: SafeArea(child: _buildBottomControls(context, game)),
          ),
        ],
      ),
    );
  }

  // --- NUOVO WIDGET AVATAR MIGLIORATO ---
  Widget _buildEnhancedPlayerAvatar(Player player, int groupIndex, GamePhase phase, double angle) {
    // Determina colori bordo selezione
    Color borderColor = Colors.white24; // Default bordo sottile
    double borderWidth = 2;
    double scale = 1.0;

    List<Color> groupColors = [Colors.greenAccent, Colors.cyanAccent, Colors.orangeAccent, Colors.purpleAccent];
    if (phase == GamePhase.pickingLosers) groupColors = [Colors.redAccent, Colors.deepOrangeAccent, Colors.pinkAccent, Colors.amber];

    if (groupIndex != -1) {
      borderWidth = 4;
      borderColor = groupColors[groupIndex % groupColors.length];
      scale = 1.15; // Leggero ingrandimento se selezionato
    }

    // Genera iniziali (Max 2 caratteri)
    String initials = player.name.isNotEmpty ? player.name[0].toUpperCase() : "?";
    if (player.name.length > 1) {
      initials += player.name[1].toLowerCase(); // Es: "Ma"
    }

    // Colore Avatar deterministico basato sul nome (così "Marco" è sempre Blu, "Anna" è Rossa)
    final int hash = player.name.codeUnits.fold(0, (p, c) => p + c);
    final List<Color> avatarColors = [Colors.blue.shade700, Colors.teal.shade700, Colors.indigo.shade700, Colors.deepPurple.shade700, Colors.brown.shade700];
    final Color avatarColor = avatarColors[hash % avatarColors.length];

    return Transform.scale(
      scale: scale,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // AVATAR CERCHIO
          Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: borderColor, width: borderWidth),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 4, offset: const Offset(0, 2))],
            ),
            child: CircleAvatar(
              radius: 26, // Più grande (era 22)
              backgroundColor: avatarColor,
              foregroundColor: Colors.white,
              child: Text(initials, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
            ),
          ),
          
          const SizedBox(height: 4),

          // ETICHETTA NOME & SCORE
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            constraints: const BoxConstraints(maxWidth: 80), // Max larghezza per evitare overflow
            decoration: BoxDecoration(
              color: Colors.black87,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.white12),
            ),
            child: Column(
              children: [
                Text(
                  player.name, 
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 2),
                Text(
                  "${player.score.toStringAsFixed(2)}€", 
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: player.score < 0 ? Colors.redAccent : Colors.greenAccent, 
                    fontSize: 11, 
                    fontWeight: FontWeight.w900
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDealerToken(double tableRadius, int playerCount, int dealerIndex) {
    final double tokenRadius = tableRadius - 105; // Posizionato più interno
    final double angle = (2 * pi * dealerIndex) / playerCount - (pi / 2);
    
    return Transform.translate(
      offset: Offset(tokenRadius * cos(angle), tokenRadius * sin(angle)),
      child: Container(
        width: 32, height: 32,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFFFD700), Color(0xFFFFA000)]),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 4)],
        ),
        child: const Center(child: Text("D", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.black87))),
      ),
    );
  }

  // --- CONTROLLI (Con pulsante Link migliorato) ---
  Widget _buildBottomControls(BuildContext context, GameProvider game) {
    if (game.currentPhase == GamePhase.dealerSelection) {
        bool canAddMore = game.players.length < 10;
        bool isPotClean = game.canChangeBet; 
        bool enableAddButton = canAddMore && isPotClean;
        bool canPlay = game.players.length >= 5;
        Color passButtonColor = canPlay ? Colors.blueGrey[700]! : Colors.grey[800]!;
        Color playButtonColor = canPlay ? const Color(0xFF1E88E5) : const Color(0xFF1E88E5).withOpacity(0.3);
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!canPlay)
              Padding(padding: const EdgeInsets.only(bottom: 8.0), child: Text("Minimo 5 giocatori (${game.players.length}/5)", style: const TextStyle(color: Colors.orangeAccent, fontSize: 12))),
            Row(
              children: [
                FloatingActionButton.small(
                  heroTag: "add", 
                  backgroundColor: enableAddButton ? Colors.blueGrey : Colors.grey[800], 
                  onPressed: enableAddButton ? () => _showAddPlayerDialog(context) : null, 
                  child: Icon(Icons.person_add, color: canAddMore ? Colors.white : Colors.white24)
                ),
                const SizedBox(width: 12),
                Expanded(child: _buildActionButton("PASSA (+${game.baseBet.toStringAsFixed(2)})", passButtonColor, canPlay ? game.passHandWithoutPlaying : null)),
                const SizedBox(width: 12),
                Expanded(flex: 2, child: _buildActionButton("GIOCA MANO", playButtonColor, canPlay ? game.startHand : null)),
              ],
            ),
          ],
        );
    }

    // FASE 2/3
    Color btnColor = game.currentPhase == GamePhase.pickingWinners ? const Color(0xFF43A047) : const Color(0xFFE53935);
    String btnText = game.currentPhase == GamePhase.pickingWinners ? "CONFERMA" : "FINE MANO";
    VoidCallback? onConfirm;
    if (game.currentPhase == GamePhase.pickingWinners) {
      onConfirm = game.selectionGroups.isEmpty ? null : game.confirmWinners;
    } else {
      onConfirm = game.confirmLosersAndEndHand;
    }

    return Row(
      children: [
        // Tasto Società
        Material(
          color: game.isLinkingMode ? const Color(0xFFFFC107) : Colors.grey[800],
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            onTap: game.toggleLinkingMode,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Icon(Icons.link, color: game.isLinkingMode ? Colors.black87 : Colors.white70),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: btnColor,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 4,
            ),
            onPressed: onConfirm,
            child: Text(btnText, style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 1)),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButton(String text, Color color, VoidCallback? onTap) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        disabledBackgroundColor: color.withOpacity(0.3),
        disabledForegroundColor: Colors.white12,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      onPressed: onTap,
      child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
    );
  }

  // --- DIALOGS (Invariati o leggermente puliti) ---
  void _showAddPlayerDialog(BuildContext context) {
      final controller = TextEditingController();
      showDialog(context: context, builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF263238),
          title: const Text("Nuovo Giocatore", style: TextStyle(color: Colors.white)),
          content: TextField(controller: controller, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Nome", hintStyle: TextStyle(color: Colors.white38), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white38)))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla", style: TextStyle(color: Colors.white54))),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blue),
              onPressed: () {
                if (controller.text.isNotEmpty) {
                  Provider.of<GameProvider>(context, listen: false).addPlayer(controller.text);
                  Navigator.pop(ctx);
                }
              }, 
              child: const Text("Aggiungi", style: TextStyle(color: Colors.white)))
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
                const SizedBox(height: 10),
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
