import 'package:uuid/uuid.dart';

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
    String? id,
    required this.name,
    this.score = 0.0,
    this.isActive = true,
  }) : id = id ?? const Uuid().v4();

  Player copy() {
    return Player(
      id: id,
      name: name,
      score: score,
      isActive: isActive,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'score': score,
      'is_active': isActive ? 1 : 0,
    };
  }

  // Metodo per JSON (server web)
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'score': score,
      'isActive': isActive,
    };
  }

  factory Player.fromMap(Map<String, dynamic> map) {
    return Player(
      id: map['id'],
      name: map['name'],
      score: (map['score'] as num).toDouble(),
      isActive: (map['is_active'] as int) == 1,
    );
  }
}
