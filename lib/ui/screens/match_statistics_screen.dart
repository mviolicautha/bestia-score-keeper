import 'package:flutter/material.dart';
import 'package:bestia_scoreboard_application/data/model/player.dart';

class MatchStatisticsScreen extends StatelessWidget {
  final List<Player> players; // Giocatori ordinati per punteggio finale
  final Map<String, dynamic> stats; // Statistiche calcolate dai log

  const MatchStatisticsScreen({
    super.key,
    required this.players,
    required this.stats,
  });

  @override
  Widget build(BuildContext context) {
    final Map<String, int> wins = stats['wins'];
    final Map<String, int> bestie = stats['bestie'];
    final int rounds = stats['rounds'];

    // Trova i record
    String mostBestieName = "-";
    int mostBestieCount = 0;
    bestie.forEach((key, value) {
      if (value > mostBestieCount) {
        mostBestieCount = value;
        mostBestieName = key;
      }
    });

    String mostWinsName = "-";
    int mostWinsCount = 0;
    wins.forEach((key, value) {
      if (value > mostWinsCount) {
        mostWinsCount = value;
        mostWinsName = key;
      }
    });

    return Scaffold(
      backgroundColor: const Color(0xFF1A233A),
      appBar: AppBar(
        // TITOLO BIANCO
        title: const Text(
          "Statistiche Partita", 
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)
        ),
        // FRECCIA BACK BIANCA
        iconTheme: const IconThemeData(color: Colors.white),
        backgroundColor: const Color(0xFF1A233A),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // HEADER CARDS
            Row(
              children: [
                Expanded(child: _buildStatCard("Mani Giocate", rounds.toString(), Icons.history, Colors.blueGrey)),
                const SizedBox(width: 10),
                Expanded(child: _buildStatCard("Piatto Max", _calculateMaxPot(), Icons.show_chart, Colors.amber)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: _buildStatCard("Il Cecchino", "$mostWinsName ($mostWinsCount)", Icons.emoji_events, Colors.green)),
                const SizedBox(width: 10),
                Expanded(child: _buildStatCard("Re della Bestia", "$mostBestieName ($mostBestieCount)", Icons.mood_bad, Colors.redAccent)),
              ],
            ),

            const SizedBox(height: 30),
            
            // TITOLO VITTORIE
            const Text(
              "VITTORIE PER GIOCATORE", 
              style: TextStyle(color: Colors.white70, fontSize: 14, letterSpacing: 1.5, fontWeight: FontWeight.bold)
            ),
            const SizedBox(height: 10),
            _buildBarChart(players, wins, Colors.greenAccent),

            const SizedBox(height: 30),

            // TITOLO BESTIE
            const Text(
              "BESTIE PRESE PER GIOCATORE", 
              style: TextStyle(color: Colors.white70, fontSize: 14, letterSpacing: 1.5, fontWeight: FontWeight.bold)
            ),
            const SizedBox(height: 10),
            _buildBarChart(players, bestie, Colors.redAccent),
            
            const SizedBox(height: 40),
          ],
        ),
      ),
    );
  }

  String _calculateMaxPot() {
    if (stats.containsKey('maxPot')) {
      double val = stats['maxPot'];
      return "${val.toStringAsFixed(2)} €";
    }
    return "0.00 €"; 
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 12),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
          Text(title, style: const TextStyle(color: Colors.white38, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildBarChart(List<Player> players, Map<String, int> data, Color barColor) {
    // Troviamo il massimo per normalizzare la barra
    int maxVal = 0;
    if (data.isNotEmpty) {
      maxVal = data.values.reduce((curr, next) => curr > next ? curr : next);
    }
    if (maxVal == 0) maxVal = 1;

    // Ordiniamo la lista per questo specifico grafico (decrescente)
    List<Player> sorted = List.from(players);
    sorted.sort((a, b) => (data[b.name] ?? 0).compareTo(data[a.name] ?? 0));

    return Column(
      children: sorted.map((p) {
        int val = data[p.name] ?? 0;
        if (val == 0) return const SizedBox.shrink(); // Nascondi chi ha 0

        double percentage = val / maxVal;

        return Padding(
          padding: const EdgeInsets.only(bottom: 12.0),
          child: Row(
            children: [
              SizedBox(
                width: 80,
                child: Text(p.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Stack(
                  children: [
                    Container(
                      height: 12,
                      decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(6)),
                    ),
                    FractionallySizedBox(
                      widthFactor: percentage,
                      child: Container(
                        height: 12,
                        decoration: BoxDecoration(color: barColor, borderRadius: BorderRadius.circular(6)),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Text("$val", style: TextStyle(color: barColor, fontWeight: FontWeight.bold)),
            ],
          ),
        );
      }).toList(),
    );
  }
}
