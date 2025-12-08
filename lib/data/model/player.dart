enum GamePhase {
  dealerSelection, 
  pickingWinners,  
  pickingLosers    
}

class Player {
  final String id;
  String name;
  double score;
  bool isActive; 

  Player({
    required this.name, 
    this.score = 0.0, 
    this.isActive = true,
    String? id,
  }) : id = id ?? DateTime.now().microsecondsSinceEpoch.toString();

  // Metodo per clonare il giocatore (Deep Copy essenziale per l'Undo)
  Player copy() {
    return Player(
      id: id,
      name: name,
      score: score,
      isActive: isActive,
    );
  }

  Map<String, dynamic> toMap(int sortOrder) {
    return {
      'id': id,
      'name': name,
      'score': score,
      'is_active': isActive ? 1 : 0, 
      'sort_order': sortOrder,
    };
  }
}
