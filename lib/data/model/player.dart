enum GamePhase {
  dealerSelection, // Fase 1: Si decide se giocare o passare
  pickingWinners,  // Fase 2: Chi ha vinto?
  pickingLosers    // Fase 3: Chi ha perso (bussato)?
}

class Player {
  final String id;
  String name;
  int score;

  Player({
    required this.name, 
    this.score = 0, 
    String? id,
  }) : id = id ?? DateTime.now().microsecondsSinceEpoch.toString();

  // Metodi per convertire da/verso Database
  Map<String, dynamic> toMap(int sortOrder) {
    return {
      'id': id,
      'name': name,
      'score': score,
      'sort_order': sortOrder,
    };
  }
}
