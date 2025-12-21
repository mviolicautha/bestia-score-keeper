import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_web_socket/shelf_web_socket.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:bestia_scoreboard_application/logic/game_provider.dart';
import 'package:bestia_scoreboard_application/server/web_assets.dart';

class BestiaHttpServer {
  HttpServer? _server;
  final GameProvider gameProvider;
  final List<WebSocketChannel> _clients = [];
  int _connectedClients = 0;
  
  BestiaHttpServer(this.gameProvider) {
    // Ascolta cambiamenti nel GameProvider per notificare i client
    gameProvider.addListener(_notifyClients);
  }

  int get connectedClients => _connectedClients;

  Future<String?> start() async {
    try {
      // Ottieni l'indirizzo IP locale
      final ip = await _getLocalIp();
      if (ip == null) return null;

      // Crea l'handler per le richieste
      final handler = const Pipeline()
          .addMiddleware(logRequests())
          .addHandler(_router);

      // Avvia il server sulla porta 8080
      _server = await shelf_io.serve(handler, ip, 8080);
      print('Server avviato su http://$ip:8080');
      
      return 'http://$ip:8080';
    } catch (e) {
      print('Errore avvio server: $e');
      return null;
    }
  }

  Future<void> stop() async {
    // Chiudi tutti i WebSocket
    for (var client in _clients) {
      await client.sink.close();
    }
    _clients.clear();
    _connectedClients = 0;

    // Ferma il server
    await _server?.close(force: true);
    _server = null;
    
    // Rimuovi listener
    gameProvider.removeListener(_notifyClients);
    
    print('Server fermato');
  }

  Future<String?> _getLocalIp() async {
    try {
      // Trova l'interfaccia di rete WiFi
      final interfaces = await NetworkInterface.list(
        type: InternetAddressType.IPv4,
        includeLinkLocal: false,
      );
      
      for (var interface in interfaces) {
        // Cerca interfacce WiFi comuni
        if (interface.name.toLowerCase().contains('wlan') ||
            interface.name.toLowerCase().contains('wifi') ||
            interface.name.toLowerCase().contains('en0')) {
          for (var addr in interface.addresses) {
            if (!addr.isLoopback && addr.type == InternetAddressType.IPv4) {
              return addr.address;
            }
          }
        }
      }
      
      // Fallback: prendi la prima interfaccia non-loopback
      for (var interface in interfaces) {
        for (var addr in interface.addresses) {
          if (!addr.isLoopback && addr.type == InternetAddressType.IPv4) {
            return addr.address;
          }
        }
      }
    } catch (e) {
      print('Errore nel recupero IP: $e');
    }
    return null;
  }

  FutureOr<Response> _router(Request request) {
    final path = request.url.path;

    // API endpoints
    if (path == 'api/game-state') {
      return _handleGameState(request);
    } else if (path == 'api/history') {
      return _handleHistory(request);
    } else if (path == 'api/ws') {
      return _handleWebSocket(request);
    }
    // Serve file statici HTML/CSS/JS
    else if (path == '' || path == '/') {
      return Response.ok(
        WebAssets.indexHtml,
        headers: {'Content-Type': 'text/html; charset=utf-8'},
      );
    } else if (path == 'styles.css') {
      return Response.ok(
        WebAssets.stylesCss,
        headers: {'Content-Type': 'text/css; charset=utf-8'},
      );
    } else if (path == 'app.js') {
      return Response.ok(
        WebAssets.appJs,
        headers: {'Content-Type': 'application/javascript; charset=utf-8'},
      );
    }

    return Response.notFound('Not Found');
  }

  Response _handleGameState(Request request) {
    final gameState = gameProvider.toJson();
    return Response.ok(
      jsonEncode(gameState),
      headers: {'Content-Type': 'application/json'},
    );
  }

  Response _handleHistory(Request request) {
    final logs = gameProvider.gameLogs.map((log) => log.toJson()).toList();
    return Response.ok(
      jsonEncode({'logs': logs}),
      headers: {'Content-Type': 'application/json'},
    );
  }

  FutureOr<Response> _handleWebSocket(Request request) {
    final handler = webSocketHandler((WebSocketChannel webSocket) {
      _clients.add(webSocket);
      _connectedClients = _clients.length;
      
      print('Client WebSocket connesso. Totale: $_connectedClients');

      // Invia stato iniziale
      webSocket.sink.add(jsonEncode({
        'type': 'initial',
        'data': gameProvider.toJson(),
      }));

      // Gestisci disconnessione
      webSocket.stream.listen(
        (message) {
          // Eventualmente gestisci messaggi dal client
        },
        onDone: () {
          _clients.remove(webSocket);
          _connectedClients = _clients.length;
          print('Client WebSocket disconnesso. Totale: $_connectedClients');
        },
        onError: (error) {
          _clients.remove(webSocket);
          _connectedClients = _clients.length;
          print('Errore WebSocket: $error');
        },
      );
    });

    return handler(request);
  }

  void _notifyClients() {
    if (_clients.isEmpty) return;

    final gameState = gameProvider.toJson();
    final message = jsonEncode({
      'type': 'update',
      'data': gameState,
    });

    // Invia a tutti i client connessi
    final deadClients = <WebSocketChannel>[];
    for (var client in _clients) {
      try {
        client.sink.add(message);
      } catch (e) {
        print('Errore invio a client: $e');
        deadClients.add(client);
      }
    }

    // Rimuovi client morti
    for (var dead in deadClients) {
      _clients.remove(dead);
    }
    _connectedClients = _clients.length;
  }
}
