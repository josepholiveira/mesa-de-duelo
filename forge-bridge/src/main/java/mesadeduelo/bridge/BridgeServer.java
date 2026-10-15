package mesadeduelo.bridge;

import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.group.ChannelGroup;
import io.netty.channel.group.DefaultChannelGroup;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.util.concurrent.GlobalEventExecutor;

/**
 * Servidor WebSocket em ws://HOST:PORTA/ws. No modo watch, quem conecta recebe na hora o último estado publicado
 * por {@link #broadcast}; no modo play cada conexão recebe só o que é endereçado a ela ({@link #send(Channel, String)}).
 */
final class BridgeServer {
    private final String host;
    private final int port;
    private final ChannelGroup clients = new DefaultChannelGroup(GlobalEventExecutor.INSTANCE);
    private final Listener listener;
    private volatile String last;

    interface Listener {
        void onConnect(Channel ch);
        void onMessage(Channel ch, String text);
        void onDisconnect(Channel ch);
    }

    BridgeServer(String host, int port, Listener listener) {
        this.host = host;
        this.port = port;
        this.listener = listener;
    }

    void start() throws InterruptedException {
        EventLoopGroup boss = new NioEventLoopGroup(1);
        EventLoopGroup workers = new NioEventLoopGroup(2);
        new ServerBootstrap()
            .group(boss, workers)
            .channel(NioServerSocketChannel.class)
            .childHandler(new ChannelInitializer<SocketChannel>() {
                @Override protected void initChannel(SocketChannel ch) {
                    ch.pipeline()
                        .addLast(new HttpServerCodec())
                        .addLast(new HttpObjectAggregator(1 << 16))
                        .addLast(new WebSocketServerProtocolHandler("/ws", null, true, 1 << 20))
                        .addLast(new SimpleChannelInboundHandler<TextWebSocketFrame>() {
                            @Override protected void channelRead0(ChannelHandlerContext ctx, TextWebSocketFrame frame) {
                                listener.onMessage(ctx.channel(), frame.text());
                            }
                            @Override public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
                                if (evt instanceof WebSocketServerProtocolHandler.HandshakeComplete) {
                                    clients.add(ctx.channel());
                                    String snapshot = last;
                                    if (snapshot != null) ctx.channel().writeAndFlush(new TextWebSocketFrame(snapshot));
                                    listener.onConnect(ctx.channel());
                                }
                                super.userEventTriggered(ctx, evt);
                            }
                            @Override public void channelInactive(ChannelHandlerContext ctx) throws Exception {
                                listener.onDisconnect(ctx.channel());
                                super.channelInactive(ctx);
                            }
                        });
                }
            })
            .bind(host, port).sync();
    }

    void broadcast(String json) {
        last = json;
        clients.writeAndFlush(new TextWebSocketFrame(json));
    }

    /** Envia para uma conexão só; ignora se ela já fechou. */
    static void send(Channel ch, String json) {
        if (ch != null && ch.isActive()) ch.writeAndFlush(new TextWebSocketFrame(json));
    }

    int clientCount() { return clients.size(); }
}
