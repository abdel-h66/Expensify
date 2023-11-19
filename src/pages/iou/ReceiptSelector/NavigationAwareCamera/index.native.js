import PropTypes from 'prop-types';
import React from 'react';
import {View} from 'react-native';
import {Camera} from 'react-native-vision-camera';
import useTabNavigatorFocus from '@hooks/useTabNavigatorFocus';
import useThemeStyles from '@styles/useThemeStyles';

const propTypes = {
    /* The index of the tab that contains this camera */
    cameraTabIndex: PropTypes.number.isRequired,
};

// Wraps a camera that will only be active when the tab is focused or as soon as it starts to become focused.
const NavigationAwareCamera = React.forwardRef(({cameraTabIndex, ...props}, ref) => {
    const isCameraActive = useTabNavigatorFocus({tabIndex: cameraTabIndex});
    const styles = useThemeStyles();

    return (
        <View styles={[styles.flex1]}>
            <Camera
                ref={ref}
                // eslint-disable-next-line react/jsx-props-no-spreading
                {...props}
                isActive={isCameraActive}
            />
        </View>
    );
});

NavigationAwareCamera.propTypes = propTypes;
NavigationAwareCamera.displayName = 'NavigationAwareCamera';

export default NavigationAwareCamera;
