import 'dart:math';
import 'dart:ui'; 
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:showcaseview/showcaseview.dart'; 
import 'package:bestia_scoreboard_application/logic/game_provider.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';
import 'package:bestia_scoreboard_application/data/model/game_log.dart'; 
import 'package:bestia_scoreboard_application/ui/screens/match_statistics_screen.dart';

class GameTableScreen extends StatefulWidget {
  const GameTableScreen({super.key});

  @override
  State<GameTableScreen> createState() => _GameTableScreenState();
}

class _GameTableScreenState extends State<GameTableScreen> {
  final GlobalKey _potKey = GlobalKey();
  final GlobalKey _settingsKey = GlobalKey();
  final GlobalKey _undoKey = GlobalKey();
  final GlobalKey _addPlayerKey = GlobalKey();
  final GlobalKey _actionsKey = GlobalKey();
  final GlobalKey _endGameKey = GlobalKey();
  final GlobalKey _historyKey = GlobalKey(); 

  @override
  Widget build(BuildContext context) {
    return ShowCaseWidget(
      builder: (context) => _buildScaffold(context),
    );
  }

  Widget _buildScaffold(BuildContext context) {
    final game = context.watch<GameProvider>();
    
    if (game.isLoading) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      // 1. APPBAR PULITA (Senza Titolo)
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A233A), 
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.help_outline, color: Colors.cyanAccent),
          tooltip: "Guida / Tutorial",
          onPressed: () {
            ShowCaseWidget.of(context).startShowCase([
              _potKey,
              _addPlayerKey,
              _actionsKey,
              _undoKey,
              _historyKey, 
              _endGameKey,
            ]);
          },
        ),
        actions: [
          Showcase(
            key: _historyKey,
            title: 'Cronologia',
            description: 'Vedi tutte le azioni della partita.',
            child: IconButton(
              icon: const Icon(Icons.history, color: Colors.white),
              tooltip: "Storico Partita",
              onPressed: () => _showHistoryBottomSheet(context),
            ),
          ),
          if (game.canUndo)
            Showcase(
              key: _undoKey,
              title: 'Annulla Azione',
              description: 'Torna indietro fino a 5 mosse.',
              child: IconButton(
                icon: const Icon(Icons.undo, color: Colors.amberAccent),
                tooltip: "Annulla ultima azione",
                onPressed: () {
                  game.undoLastAction();
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Azione annullata"), duration: Duration(seconds: 1))
                  );
                },
              ),
            ),
          IconButton(
            icon: Icon(Icons.settings, color: game.canChangeBet ? Colors.white : Colors.white24),
            tooltip: "Imposta Messa",
            onPressed: () {
              if (game.canChangeBet) {
                _showSettingsDialog(context);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossibile cambiare Messa a partita in corso!"), backgroundColor: Colors.orange));
              }
            },
          ),
          Showcase(
            key: _endGameKey,
            title: 'Fine Partita',
            description: 'Termina la sessione e calcola i risultati.',
            child: IconButton(
              icon: const Icon(Icons.flag, color: Colors.redAccent), 
              tooltip: "Termina Partita",
              onPressed: () => _showEndGameDialog(context)
            ),
          ),
        ],
      ),
      backgroundColor: const Color(0xFF1A233A),
      body: Column(
        children: [
          // 2. NUOVA ISOLA DI STATO (Sotto l'AppBar)
          _buildStatusIsland(game.currentPhase),
          
          const SizedBox(height: 10),

          Showcase(
            key: _potKey,
            title: 'Il Piatto',
            description: "Qui vedi il montepremi attuale.",
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Column(
                children: [
                  const Text("PIATTO", style: TextStyle(color: Colors.white38, letterSpacing: 2, fontSize: 10)),
                  Text("${game.currentPot.toStringAsFixed(2)} €", style: const TextStyle(color: Color(0xFFFFD700), fontSize: 42, fontWeight: FontWeight.bold, height: 1.0)),
                  Text("Messa: ${game.baseBet.toStringAsFixed(2)} €", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                ],
              ),
            ),
          ),

          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final double tableDiameter = min(constraints.maxWidth, constraints.maxHeight) - 20;
                final double radius = tableDiameter / 2;
                final activeList = game.activePlayers;

                int visualDealerIndex = -1;
                if (game.players.isNotEmpty) {
                  final dealerPlayer = game.players[game.dealerIndex];
                  visualDealerIndex = activeList.indexWhere((p) => p.id == dealerPlayer.id);
                }

                return Center(
                  child: SizedBox(
                    width: tableDiameter, height: tableDiameter,
                    child: Stack(
                      alignment: Alignment.center,
                      clipBehavior: Clip.none, 
                      children: [
                        _buildTableBackground(tableDiameter, game.currentPhase),
                        
                        if (game.selectionGroups.isNotEmpty)
                          SizedBox(
                            width: tableDiameter,
                            height: tableDiameter,
                            child: CustomPaint(
                              painter: SelectionLinesPainter(
                                players: activeList,
                                groups: game.selectionGroups,
                                radius: radius - 35,
                                phase: game.currentPhase,
                              ),
                            ),
                          ),
                        
                        Opacity(
                          opacity: 0.1,
                          child: Text(
                            "\u2660", 
                            style: TextStyle(fontSize: tableDiameter * 0.5, color: Colors.black, height: 1.0),
                          ),
                        ),

                        ...List.generate(activeList.length, (index) {
                          final p = activeList[index];
                          final double angle = (2 * pi * index) / activeList.length - (pi / 2);
                          final double playerRadius = radius - 35; 
                          
                          int groupIndex = game.getPlayerGroupIndex(p.id);

                          return Transform.translate(
                            offset: Offset(playerRadius * cos(angle), playerRadius * sin(angle)),
                            child: GestureDetector(
                              onTap: () {
                                if (game.currentPhase == GamePhase.dealerSelection) {
                                  if (game.canChangeBet) {
                                    _showPlayerStatsDialog(context, p);
                                  } 
                                  return;
                                }
                                
                                if (game.currentPhase == GamePhase.pickingLosers && game.currentHandWinners.contains(p.id)) {
                                  _showHybridWarningDialog(context, p, game);
                                } else {
                                  game.togglePlayerSelection(p.id);
                                }
                              },
                              child: _buildEnhancedPlayerAvatar(p, groupIndex, game.currentPhase, angle, index),
                            ),
                          );
                        }),

                        if (visualDealerIndex != -1)
                          _buildDealerToken(radius, activeList.length, visualDealerIndex),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
            color: const Color(0xFF121826),
            child: SafeArea(child: _buildBottomControls(context, game)),
          ),
        ],
      ),
    );
  }

  // --- NUOVA ISOLA DI STATO ---
  Widget _buildStatusIsland(GamePhase phase) {
    String text;
    Color color;
    IconData icon;

    switch (phase) {
      case GamePhase.dealerSelection:
        text = "MANO IN CORSO";
        color = Colors.blueGrey; // Neutro
        icon = Icons.gamepad;
        break;
      case GamePhase.pickingWinners:
        text = "SELEZIONA VINCITORI";
        color = Colors.green;
        icon = Icons.emoji_events;
        break;
      case GamePhase.pickingLosers:
        text = "SELEZIONA BUSSATI";
        color = Colors.redAccent;
        icon = Icons.mood_bad;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.9),
        borderRadius: BorderRadius.circular(30),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.4),
            blurRadius: 8,
            offset: const Offset(0, 4),
          )
        ],
        border: Border.all(color: Colors.white24, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 8),
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 14,
              letterSpacing: 1.0,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableBackground(double diameter, GamePhase phase) {
    Color baseColor;
    Color borderColor;

    switch (phase) {
      case GamePhase.dealerSelection:
        baseColor = const Color(0xFF2E7D32); 
        borderColor = const Color(0xFF4E342E);
        break;
      case GamePhase.pickingWinners:
        baseColor = const Color(0xFF00695C); 
        borderColor = const Color(0xFF004D40);
        break;
      case GamePhase.pickingLosers:
        baseColor = const Color(0xFFB71C1C); 
        borderColor = const Color(0xFF7F0000);
        break;
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        color: baseColor,
        shape: BoxShape.circle,
        border: Border.all(color: borderColor, width: 8),
        boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 25, spreadRadius: 5)],
      ),
    );
  }

  // --- POPUPS & DIALOGS ---
  
  void _showHybridWarningDialog(BuildContext context, Player p, GameProvider game) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 28),
            SizedBox(width: 10),
            Text("Attenzione")
          ],
        ),
        content: Text(
          "${p.name} ha vinto una parte del piatto in questa mano.\n\nSei sicuro di volerlo selezionare anche come Bestia (sconfitto)?",
          style: const TextStyle(fontSize: 15),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Annulla", style: TextStyle(color: Colors.grey)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () {
              Navigator.pop(ctx);
              game.togglePlayerSelection(p.id); 
            },
            child: const Text("Sì, Assegna Bestia", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _showTwoWinnersDialog(BuildContext context, GameProvider game) {
    List<String> groupNames = [];
    for (var group in game.selectionGroups) {
      List<String> names = group.map((id) {
        return game.players.firstWhere((p) => p.id == id).name;
      }).toList();
      groupNames.add(names.join(" & ")); 
    }

    showDialog(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text("Chi prende i 2/3 del piatto?"),
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
            child: Text("Nella Bestia il piatto è diviso in 3 parti.\nSeleziona chi ha fatto più prese:", style: TextStyle(color: Colors.grey, fontSize: 13)),
          ),
          
          SimpleDialogOption(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.green[50], borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.green)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(groupNames[0], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16))),
                  const Text("2/3", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
                ],
              ),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              game.confirmWinners(majorGroupIndex: 0);
            },
          ),

          SimpleDialogOption(
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.blue[50], borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.blue)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(groupNames[1], style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16))),
                  const Text("2/3", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
                ],
              ),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              game.confirmWinners(majorGroupIndex: 1);
            },
          ),
          
          Padding(
            padding: const EdgeInsets.only(top: 10, right: 10),
            child: Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla")),
            ),
          )
        ],
      ),
    );
  }

  // --- UI COMPONENTS ---

  void _showHistoryBottomSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A233A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (context) {
        final logs = Provider.of<GameProvider>(context).gameLogs;
        return Container(
          padding: const EdgeInsets.only(top: 16),
          child: Column(
            children: [
              Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[600], borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              const Text("Cronologia Eventi", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              Expanded(
                child: logs.isEmpty 
                  ? const Center(child: Text("Nessun evento registrato", style: TextStyle(color: Colors.white38)))
                  : ListView.builder(
                      itemCount: logs.length,
                      itemBuilder: (ctx, i) {
                        final log = logs[i];
                        IconData icon;
                        Color color;
                        switch (log.type) {
                          case LogType.gain:
                            icon = Icons.emoji_events; color = Colors.greenAccent; break;
                          case LogType.loss:
                            icon = Icons.warning_amber_rounded; color = Colors.redAccent; break;
                          case LogType.pass:
                            icon = Icons.refresh; color = Colors.blueGrey; break;
                          case LogType.info:
                          default:
                            if (log.message.contains("aggiunto") || log.message.contains("Nuova partita")) {
                              icon = Icons.person_add; color = Colors.cyanAccent;
                            } else if (log.message.contains("lasciato")) {
                              icon = Icons.person_remove; color = Colors.orangeAccent;
                            } else if (log.message.contains("Messa modificata")) {
                              icon = Icons.settings; color = Colors.grey;
                            } else {
                              icon = Icons.info_outline; color = Colors.white54;
                            }
                        }
                        return ListTile(
                          leading: Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle), child: Icon(icon, color: color, size: 20)),
                          title: Text(log.message, style: const TextStyle(color: Colors.white, fontSize: 13)),
                          subtitle: Text("${log.timestamp.hour.toString().padLeft(2,'0')}:${log.timestamp.minute.toString().padLeft(2,'0')}", style: const TextStyle(color: Colors.white30, fontSize: 11)),
                          dense: true,
                        );
                      },
                    ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildEnhancedPlayerAvatar(Player player, int groupIndex, GamePhase phase, double angle, int playerIndex) {
    const double avatarRadius = 26.0; 
    
    // Palette Colori
    final List<Color> distinctColors = [
      Colors.red.shade700, Colors.blue.shade700, Colors.green.shade700, Colors.orange.shade900,
      Colors.purple.shade700, Colors.teal.shade700, Colors.pink.shade700, Colors.blueGrey.shade700,
      Colors.brown.shade700, Colors.indigo.shade700, Colors.lime.shade900, Colors.cyan.shade800,
    ];
    final Color avatarColor = distinctColors[playerIndex % distinctColors.length];

    // Gestione Gruppi
    Color borderColor = Colors.white.withOpacity(0.3);
    double borderWidth = 2.0;
    double scale = 1.0;
    
    List<Color> groupColors = [Colors.greenAccent, Colors.cyanAccent, Colors.orangeAccent, Colors.purpleAccent];
    if (phase == GamePhase.pickingLosers) groupColors = [Colors.redAccent, Colors.deepOrangeAccent, Colors.pinkAccent, Colors.amberAccent];

    Color? groupBadgeColor;
    String? groupLabel;

    if (groupIndex != -1) {
      Color baseColor = groupColors[groupIndex % groupColors.length];
      borderColor = baseColor;
      borderWidth = 3.5;
      groupBadgeColor = baseColor;
      groupLabel = "${groupIndex + 1}"; 
      scale = 1.1;
    }

    return Transform.scale(
      scale: scale,
      child: Stack(
        alignment: Alignment.topCenter,
        clipBehavior: Clip.none, 
        children: [
          // 1. TARGHETTA DATI (Sotto)
          Container(
            margin: const EdgeInsets.only(top: 42),
            padding: const EdgeInsets.fromLTRB(8, 14, 8, 6),
            constraints: const BoxConstraints(minWidth: 70, maxWidth: 94),
            decoration: BoxDecoration(
              color: const Color(0xFF1E2838).withOpacity(0.95),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white12, width: 1),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 4, offset: const Offset(0, 2))
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  player.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 1),
                Text(
                  "${player.score.toStringAsFixed(2)}€",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: player.score < 0 ? const Color(0xFFFF5252) : const Color(0xFF69F0AE),
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),

          // 2. AVATAR (Sopra)
          Container(
            width: avatarRadius * 2,
            height: avatarRadius * 2,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF1A233A), 
              border: Border.all(color: borderColor, width: borderWidth),
              boxShadow: [
                BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 6, offset: const Offset(0, 3))
              ],
            ),
            child: CircleAvatar(
              radius: avatarRadius - borderWidth,
              backgroundColor: avatarColor,
              foregroundColor: Colors.white, // Colore Icona Bianco
              // RIPRISTINATA ICONA PERSON AL POSTO DELL'INIZIALE
              child: const Icon(Icons.person, size: 30), 
            ),
          ),

          // 3. BADGE GRUPPO (NUMERO)
          if (groupLabel != null && groupBadgeColor != null)
            Positioned(
              right: -4,
              top: -4,
              child: Container(
                width: 22, height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: groupBadgeColor,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                  boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 2, offset: Offset(0, 1))],
                ),
                child: Text(
                  groupLabel,
                  style: const TextStyle(
                    color: Colors.black87, 
                    fontSize: 11, 
                    fontWeight: FontWeight.w900
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDealerToken(double tableRadius, int playerCount, int dealerIndex) {
    final double tokenRadius = tableRadius - 105; 
    final double angle = (2 * pi * dealerIndex) / playerCount - (pi / 2);
    return Transform.translate(
      offset: Offset(tokenRadius * cos(angle), tokenRadius * sin(angle)),
      child: Container(width: 28, height: 28, decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFFFD700), Color(0xFFFFA000)]), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4, offset: Offset(0, 2))]), child: const Center(child: Text("D", style: TextStyle(fontWeight: FontWeight.w900, color: Colors.black87, fontSize: 12)))),
    );
  }

  Widget _buildBottomControls(BuildContext context, GameProvider game) {
    return Showcase(
      key: _actionsKey,
      title: 'Flusso di Gioco (3 Fasi)',
      description: 
        "1. INIZIALE: Usa 'PASSA' per far girare le carte e alzare il piatto.\n\n"
        "2. VINCITORI: Premi 'GIOCA MANO' per assegnare le quote. Usa il tasto LINK per creare società.\n\n"
        "3. SCONFITTI: Dopo le vincite, seleziona chi è andato in Bestia (anche qui puoi creare gruppi).",
      child: _buildRealBottomControls(context, game),
    );
  }

  Widget _buildRealBottomControls(BuildContext context, GameProvider game) {
    if (game.currentPhase == GamePhase.dealerSelection) {
        bool canAddMore = game.activePlayers.length < 10;
        bool isPotClean = game.canChangeBet;
        bool enableAddButton = canAddMore && isPotClean;
        bool hasMinPlayers = game.activePlayers.length >= 5;
        bool hasPot = game.currentPot > 0.001; 
        bool canPass = hasMinPlayers; 
        bool canStartHand = hasMinPlayers && hasPot;

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!hasMinPlayers)
              Padding(padding: const EdgeInsets.only(bottom: 8.0), child: Text("Minimo 5 giocatori al tavolo (${game.activePlayers.length}/5)", style: const TextStyle(color: Colors.orangeAccent, fontSize: 12))),
            
            Row(
              children: [
                Showcase(
                  key: _addPlayerKey,
                  title: 'Imposta Tavolo',
                  description: 'Aggiungi i giocatori qui.\nIl primo inserito sarà il mazziere.',
                  child: FloatingActionButton.small(
                    heroTag: "add", 
                    backgroundColor: enableAddButton ? Colors.blueGrey : Colors.grey[800], 
                    onPressed: () {
                      if (!canAddMore) return; 
                      if (!isPotClean) {
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossibile aggiungere giocatori a partita in corso!"), backgroundColor: Colors.orange));
                      } else {
                        _showAddPlayerDialog(context);
                      }
                    }, 
                    child: Icon(Icons.person_add, color: enableAddButton ? Colors.white : Colors.white24)
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(child: _buildActionButton("PASSA (+${game.baseBet.toStringAsFixed(2)})", canPass ? Colors.blueGrey[700]! : Colors.grey[800]!, canPass ? game.passHandWithoutPlaying : null)),
                const SizedBox(width: 12),
                Expanded(flex: 2, child: _buildActionButton("GIOCA MANO", canStartHand ? const Color(0xFF1E88E5) : const Color(0xFF1E88E5).withOpacity(0.3), canStartHand ? game.startHand : null)),
              ],
            ),
          ],
        );
    }

    Color btnColor = game.currentPhase == GamePhase.pickingWinners ? const Color(0xFF43A047) : const Color(0xFFE53935);
    String btnText = game.currentPhase == GamePhase.pickingWinners ? "CONFERMA" : "FINE MANO";
    VoidCallback? onConfirm;
    
    if (game.currentPhase == GamePhase.pickingWinners) {
      if (game.selectionGroups.isEmpty) {
        onConfirm = null;
      } else if (game.selectionGroups.length == 2) {
        onConfirm = () => _showTwoWinnersDialog(context, game);
      } else {
        onConfirm = () => game.confirmWinners();
      }
    } else {
      onConfirm = game.confirmLosersAndEndHand;
    }

    return Row(
      children: [
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
            style: ElevatedButton.styleFrom(backgroundColor: btnColor, padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)), elevation: 4),
            onPressed: onConfirm,
            child: Text(btnText, style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold, letterSpacing: 1)),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButton(String text, Color color, VoidCallback? onTap) {
    return ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: color, disabledBackgroundColor: color, disabledForegroundColor: Colors.white12, padding: const EdgeInsets.symmetric(vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))), onPressed: onTap, child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)));
  }

  void _showAddPlayerDialog(BuildContext context) {
      final controller = TextEditingController();
      showDialog(context: context, builder: (ctx) => AlertDialog(
          backgroundColor: const Color(0xFF263238),
          title: const Text("Nuovo Giocatore", style: TextStyle(color: Colors.white)),
          content: TextField(controller: controller, style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Nome", hintStyle: TextStyle(color: Colors.white38), enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white38)))),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla", style: TextStyle(color: Colors.white54))),
            ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: Colors.blue), onPressed: () { if (controller.text.isNotEmpty) { bool success = Provider.of<GameProvider>(context, listen: false).addPlayer(controller.text); Navigator.pop(ctx); if(!success) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Impossibile aggiungere (Tavolo pieno o Piatto sporco)"))); } }, child: const Text("Aggiungi", style: TextStyle(color: Colors.white)))
          ],
        ));
  }

  void _showPlayerStatsDialog(BuildContext context, Player p) {
    showDialog(context: context, builder: (ctx) => AlertDialog(backgroundColor: Colors.white, title: Row(children: [CircleAvatar(backgroundColor: Colors.blueGrey, child: Text(p.name[0], style: const TextStyle(color: Colors.white))), const SizedBox(width: 10), Text(p.name, style: const TextStyle(color: Colors.black87))]), content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [Text("Bilancio: ${p.score.toStringAsFixed(2)} €", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: p.score < 0 ? Colors.red : Colors.green)), const SizedBox(height: 20), const Text("Vuoi che questo giocatore lasci il tavolo?\nIl suo storico verrà mantenuto per il calcolo finale, ma non parteciperà più alle mani successive.", style: TextStyle(fontSize: 13, color: Colors.grey))]), actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla")), ElevatedButton.icon(style: ElevatedButton.styleFrom(backgroundColor: Colors.red), icon: const Icon(Icons.exit_to_app, color: Colors.white), label: const Text("ABBANDONA TAVOLO", style: TextStyle(color: Colors.white)), onPressed: () { Provider.of<GameProvider>(context, listen: false).playerLeavesTable(p.id); Navigator.pop(ctx); })]));
  }

  void _showSettingsDialog(BuildContext context) {
    final game = Provider.of<GameProvider>(context, listen: false);
    double tempBet = game.baseBet; 
    showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (context, setState) {
          String displayBet = tempBet.toStringAsFixed(2);
          bool canDecrease = tempBet > 0.31; 
          return AlertDialog(backgroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), title: const Text("Imposta Messa", style: TextStyle(fontWeight: FontWeight.bold)), content: Column(mainAxisSize: MainAxisSize.min, children: [const SizedBox(height: 10), const Text("Modifica l'importo che il mazziere deve mettere ad ogni giro.", textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 13)), const SizedBox(height: 24), Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8), decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey[300]!)), child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [_buildStepperButton(icon: Icons.remove, isEnabled: canDecrease, onPressed: () { setState(() { tempBet -= 0.30; tempBet = double.parse(tempBet.toStringAsFixed(2)); }); }), Text("$displayBet €", style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Color(0xFF2E3B55))), _buildStepperButton(icon: Icons.add, isEnabled: true, onPressed: () { setState(() { tempBet += 0.30; tempBet = double.parse(tempBet.toStringAsFixed(2)); }); })]))]), actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Annulla", style: TextStyle(color: Colors.grey, fontSize: 16))), ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E3B55), padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12)), onPressed: () { game.setBaseBet(tempBet); Navigator.pop(ctx); }, child: const Text("SALVA", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)))]);
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
    final gameProvider = Provider.of<GameProvider>(context, listen: false);
    final stats = gameProvider.calculateStats();
    final results = gameProvider.endGame();
    
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
              Flexible(child: SingleChildScrollView(child: Column(children: List.generate(results.length, (index) { final p = results[index]; final isWinner = p.score > 0.001; final isLoser = p.score < -0.001; Color rowColor = index % 2 == 0 ? Colors.grey[50]! : Colors.white; return Container(color: rowColor, padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4), child: Row(children: [SizedBox(width: 30, child: index == 0 ? const Icon(Icons.emoji_events, color: Colors.amber, size: 24) : Text("#${index + 1}", style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey), textAlign: TextAlign.center)), const SizedBox(width: 10), Expanded(child: Text(p.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16), overflow: TextOverflow.ellipsis)), Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: isWinner ? Colors.green[50] : (isLoser ? Colors.red[50] : Colors.grey[100]), borderRadius: BorderRadius.circular(8), border: Border.all(color: isWinner ? Colors.green : (isLoser ? Colors.red : Colors.grey), width: 1)), child: Text("${p.score > 0 ? '+' : ''}${p.score.toStringAsFixed(2)} €", style: TextStyle(color: isWinner ? Colors.green[800] : (isLoser ? Colors.red[800] : Colors.black54), fontWeight: FontWeight.bold, fontSize: 16)))]));})))),
              const SizedBox(height: 20),
              SizedBox(width: double.infinity, child: OutlinedButton.icon(icon: const Icon(Icons.bar_chart, color: Color(0xFF2E3B55)), label: const Text("STATISTICHE PARTITA", style: TextStyle(color: Color(0xFF2E3B55), fontWeight: FontWeight.bold)), style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), side: const BorderSide(color: Color(0xFF2E3B55), width: 2)), onPressed: () { Navigator.push(context, MaterialPageRoute(builder: (context) => MatchStatisticsScreen(players: results, stats: stats))); })),
              const SizedBox(height: 10),
              SizedBox(width: double.infinity, child: ElevatedButton.icon(icon: const Icon(Icons.refresh, color: Colors.white), label: const Text("NUOVA PARTITA", style: TextStyle(color: Colors.white)), style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E3B55), padding: const EdgeInsets.symmetric(vertical: 14)), onPressed: () => Navigator.pop(ctx))),
            ],
          ),
        ),
      ),
    );
  }
}

class SelectionLinesPainter extends CustomPainter {
  final List<Player> players;
  final List<Set<String>> groups;
  final double radius;
  final GamePhase phase;

  SelectionLinesPainter({
    required this.players,
    required this.groups,
    required this.radius,
    required this.phase,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (players.isEmpty) return;

    final center = Offset(size.width / 2, size.height / 2);
    
    List<Color> groupColors = [Colors.greenAccent, Colors.cyanAccent, Colors.orangeAccent, Colors.purpleAccent];
    if (phase == GamePhase.pickingLosers) {
      groupColors = [Colors.redAccent, Colors.deepOrangeAccent, Colors.pinkAccent, Colors.amberAccent];
    }

    final Paint paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;

    for (int g = 0; g < groups.length; g++) {
      final group = groups[g];
      if (group.length < 2) continue;

      paint.color = groupColors[g % groupColors.length].withOpacity(0.6);
      
      List<Offset> points = [];
      for (String id in group) {
        int index = players.indexWhere((p) => p.id == id);
        if (index != -1) {
          final double angle = (2 * pi * index) / players.length - (pi / 2);
          final double x = center.dx + radius * cos(angle);
          final double y = center.dy + radius * sin(angle);
          points.add(Offset(x, y));
        }
      }

      for (int i = 0; i < points.length; i++) {
        for (int j = i + 1; j < points.length; j++) {
           canvas.drawLine(points[i], points[j], paint);
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant SelectionLinesPainter oldDelegate) {
    return oldDelegate.groups != groups || oldDelegate.players != players;
  }
}
