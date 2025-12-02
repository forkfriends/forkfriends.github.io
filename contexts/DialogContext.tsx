import React, { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};

export type AlertOptions = {
  title: string;
  message?: string;
  buttons?: DialogButton[];
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
};

type DialogState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: DialogButton[];
  loadingButtonIndex: number | null;
};

type DialogContextType = {
  /**
   * Show an alert dialog. On native, uses the system Alert.
   * On web, shows a custom modal.
   */
  alert: (options: AlertOptions) => void;

  /**
   * Show a confirmation dialog with confirm/cancel buttons.
   * On native, uses the system Alert. On web, shows a custom modal.
   */
  confirm: (options: ConfirmOptions) => void;
};

const DialogContext = createContext<DialogContextType | null>(null);

export function useDialog(): DialogContextType {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

const initialState: DialogState = {
  visible: false,
  title: '',
  message: undefined,
  buttons: [],
  loadingButtonIndex: null,
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(initialState);
  const isWeb = Platform.OS === 'web';

  const closeDialog = useCallback(() => {
    setState(initialState);
  }, []);

  const handleButtonPress = useCallback(
    async (button: DialogButton, index: number) => {
      if (button.onPress) {
        // Show loading state for async operations
        setState((prev) => ({ ...prev, loadingButtonIndex: index }));
        try {
          await button.onPress();
        } finally {
          closeDialog();
        }
      } else {
        closeDialog();
      }
    },
    [closeDialog]
  );

  const alert = useCallback(
    (options: AlertOptions) => {
      const buttons = options.buttons ?? [{ text: 'OK', style: 'default' }];

      if (!isWeb) {
        // Use native Alert on iOS/Android
        Alert.alert(
          options.title,
          options.message,
          buttons.map((btn) => ({
            text: btn.text,
            style: btn.style,
            onPress: btn.onPress,
          })),
          { cancelable: true }
        );
        return;
      }

      // Show web modal
      setState({
        visible: true,
        title: options.title,
        message: options.message,
        buttons,
        loadingButtonIndex: null,
      });
    },
    [isWeb]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      const cancelButton: DialogButton = {
        text: options.cancelText ?? 'Cancel',
        style: 'cancel',
        onPress: options.onCancel,
      };

      const confirmButton: DialogButton = {
        text: options.confirmText ?? 'Confirm',
        style: options.destructive ? 'destructive' : 'default',
        onPress: options.onConfirm,
      };

      const buttons = [cancelButton, confirmButton];

      if (!isWeb) {
        // Use native Alert on iOS/Android
        Alert.alert(
          options.title,
          options.message,
          buttons.map((btn) => ({
            text: btn.text,
            style: btn.style,
            onPress: btn.onPress,
          })),
          { cancelable: true }
        );
        return;
      }

      // Show web modal
      setState({
        visible: true,
        title: options.title,
        message: options.message,
        buttons,
        loadingButtonIndex: null,
      });
    },
    [isWeb]
  );

  const renderWebModal = () => {
    if (!isWeb || !state.visible) return null;

    return (
      <Modal visible={state.visible} transparent animationType="fade" onRequestClose={closeDialog}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{state.title}</Text>
            {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
            <View style={styles.actions}>
              {state.buttons.map((button, index) => {
                const isLoading = state.loadingButtonIndex === index;
                const isCancel = button.style === 'cancel';
                const isDestructive = button.style === 'destructive';

                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.button,
                      isCancel && styles.cancelButton,
                      isDestructive && styles.destructiveButton,
                      !isCancel && !isDestructive && styles.defaultButton,
                      isLoading && styles.buttonDisabled,
                    ]}
                    onPress={() => handleButtonPress(button, index)}
                    disabled={state.loadingButtonIndex !== null}>
                    {isLoading ? (
                      <ActivityIndicator color={isCancel ? '#333' : '#fff'} size="small" />
                    ) : (
                      <Text
                        style={[
                          styles.buttonText,
                          isCancel && styles.cancelButtonText,
                          (isDestructive || (!isCancel && !isDestructive)) &&
                            styles.actionButtonText,
                        ]}>
                        {button.text}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      {renderWebModal()}
    </DialogContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111',
  },
  message: {
    fontSize: 15,
    color: '#444',
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  destructiveButton: {
    backgroundColor: '#c1121f',
  },
  defaultButton: {
    backgroundColor: '#111',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#333',
  },
  actionButtonText: {
    color: '#fff',
  },
});
