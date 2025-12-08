enum GamePhase {
  dealerSelection, 
  pickingWinners,  
  pickingLosers    
}

class Player {
  final String id;
  String name;
  double score;

  Player({
    required this.name, 
    this.score = 0.0, 
    String? id,
  }) : id = id ?? DateTime.now().microsecondsSinceEpoch.toString();

  Map<String, dynamic> toMap(int sortOrder) {
    return {
      'id': id,
      'name': name,
      'score': score,
      'sort_order': sortOrder,
    };
  }
}
