enum GamePhase {
  dealerSelection, 
  pickingWinners,  
  pickingLosers    
}
class Player {
  final String id;
  String name;
  double score;
  bool isActive; // NUOVO CAMPO

  Player({
    required this.name, 
    this.score = 0.0, 
    this.isActive = true, // Di default è al tavolo
    String? id,
  }) : id = id ?? DateTime.now().microsecondsSinceEpoch.toString();

  Map<String, dynamic> toMap(int sortOrder) {
    return {
      'id': id,
      'name': name,
      'score': score,
      'is_active': isActive ? 1 : 0, // SQLite non ha bool, usiamo 0/1
      'sort_order': sortOrder,
    };
  }
}
