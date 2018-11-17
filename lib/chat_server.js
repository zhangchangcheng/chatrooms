var socketio = require('socket.io');
var io;
var guestNumber = 1;
var nickNames = {};
var namesUsed = [];
var currentRoom = {};

exports.listen = function (server) {
  // 启动Socket.io服务器，允许它搭载在已有的HTTP服务器上
  io = socketio.listen(server);
  io.set('log level', 1);

  // 定义每个用户连接的处理逻辑
  io.sockets.on('connection', function(socket) {
    // 在用户连接上来时赋予其一个访客名
    guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed);
    // 在用户连接上时把他放入聊天室Lobby里
    joinRoom(socket, 'Lobby');

    // 处理用户的信息，更名，以及聊天室的创建和变更
    handleMessageBroadcasting(socket, nickNames);
    handleNameChangeAttempts(socket, nickNames, namesUsed);
    handleRoomJoining(socket);

    // 当用户发出请求时，向其提供已经被占用的聊天室的列表
    socket.on('rooms', function() {
      socket.emit('rooms', io.sockets.manager.rooms);
    });

    // 定义用户断开连接后的清除逻辑
    handleClientDisconnection(socket, nickNames, namesUsed);
  });
}

function assignGuestName(socket, guestNumber, nickNames, namesUsed) {
  var name = 'Guest' + guestNumber;
  nickNames[socket.id] = name;
  socket.emit('nameResult', {
    success: true,
    name: name
  });
  namesUsed.push(name);
  return guestNumber +　1;
}

// 进入聊天室相关的逻辑
function joinRoom(socket, room) {
  // 让用户进入房间
  socket.join(room);
  // 记录用户的当前房间
  currentRoom(socket.id) = room;
  // 让用户知道他们进入了新的房间
  socket.emit('joinResult', {
    room: room
  });
  socket.broadcast.to(room).emit('message', {
    text: nickNames[socket.id] + 'has joined' + room + '.'
  });

  // 当前房间用户
  var usersInRoom = io.sockets.clients(room);
  // 如果不止一个用户在当前房间，汇总下都是谁
  if (usersInRoom.length > 1) {
    var usersInRoomSummary = 'Users currently in ' + room + '.';
    for (var index in usersInRoom) {
      var userSocketId = usersInRoom[index].id;
      if (userSocketId != socket.id) {
        if (index > 0) {
          usersInRoomSummary += '.';
        }
        usersInRoomSummary += nickNames[userSocketId];
      }
    }
    usersInRoomSummary += '.';
    // 将房间其他用户的汇总发送给这个用户
    socket.emit('message', {
      text: usersInRoomSummary
    })
  }
}

//更名请求的逻辑
function handleNameChangeAttempts(socket, nickNames, namesUsed) {
  socket.on('nameAttempt', function (name) {      //添加 nameAttempt 事件监听器
    if(name.indexOf('Guest') == 0){     //昵称不能以Guest 开头
      socket.emit('nameResult', {
          success: false,
          message: 'Names can`t begin with "Guest"'
      });
    }else{
      if(namesUsed.indexOf(name) == -1){      //如果昵称还没注册则执行注册
        var previousName = nickNames[socket.id];
        var previousNameIndex = namesUsed.indexOf(previousName);
        namesUsed.push(name);
        nickNames[socket.id] = name;
        delete namesUsed[previousNameIndex];
        // namesUsed.splice(previousNameIndex, 1);
        socket.emit('nameResult',{
            success: true,
            name: name
        });
        socket.broadcast.to(currentRoom[socket.id]).emit('message', {
            text: previousName + 'is now knows as ' + name + '.'
        })
      }else{      //如果昵称已被占用则提示用户
        socket.emit('nameResult',{
            success: false,
            message: 'That name is already in use'
        })
      }
    }
  })
}

//发送聊天消息
function handleMessageBroadcasting(socket, nickNames) {
  socket.on('message', function (message) {
    socket.broadcast.to(message.room).emit('message',{
        text: nickNames[socket.id] + ": " + message.text
    });
  });
}

//创建房间
function  handleRoomJoining(socket) {
  socket.on('join', function (room) {
    socket.leave(currentRoom[socket.id]);
    joinRoom(socket, room.newRoom);
  })
}

//用户断开连接
function handleClientDisconnection(socket, nickNames, namesUsed) {
  socket.on('disconnect', function () {
    var nameIndex = namesUsed.indexOf(nickNames[socket.id]);
    delete namesUsed[nameIndex];
    // namesUsed.slice(nameIndex, 1);
    delete nickNames[socket.id];
    // nickNames.slice(socket.id, 1);
  })
}