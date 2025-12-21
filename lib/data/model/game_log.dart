enum LogType { info, gain, loss, pass }

class GameLog {
  final int? id;
  final String message;
  final DateTime timestamp;
  final LogType type;

  GameLog({
    this.id,
    required this.message,
    required this.timestamp,
    required this.type,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'message': message,
      'timestamp': timestamp.toIso8601String(),
      'type': type.index,
    };
  }

  // Metodo per JSON (server web)
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'message': message,
      'timestamp': timestamp.toIso8601String(),
      'type': _logTypeToString(type),
    };
  }

  String _logTypeToString(LogType type) {
    switch (type) {
      case LogType.info:
        return 'info';
      case LogType.gain:
        return 'gain';
      case LogType.loss:
        return 'loss';
      case LogType.pass:
        return 'pass';
    }
  }

  factory GameLog.fromMap(Map<String, dynamic> map) {
    return GameLog(
      id: map['id'],
      message: map['message'],
      timestamp: DateTime.parse(map['timestamp']),
      type: LogType.values[map['type']],
    );
  }
}
