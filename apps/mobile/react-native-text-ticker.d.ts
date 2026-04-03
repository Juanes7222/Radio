declare module 'react-native-text-ticker' {
  import { Component } from 'react';
  import { TextProps, TextStyle, StyleProp } from 'react-native';

  interface TextTickerProps extends TextProps {
    duration?: number;
    loop?: boolean;
    bounce?: boolean;
    scrollSpeed?: number;
    marqueeDelay?: number;
    scrollProps?: any;
    repeatSpacer?: number;
    marqueeOnMount?: boolean;
    style?: StyleProp<TextStyle>;
    children?: React.ReactNode;
  }

  export default class TextTicker extends Component<TextTickerProps> {}
}
